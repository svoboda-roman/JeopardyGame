import { and, eq, isNotNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { auth } from "../auth.ts";
import { db } from "../db/client.ts";
import { gamePlayer as gamePlayerTable } from "../db/schema.ts";
import type { ClientToServer } from "../game/protocol.ts";
import { getOrLoadRoom } from "../game/rooms.ts";
import { GameError, type Intent } from "../game/state.ts";

interface SocketState {
	roomCode: string;
	socketId: string;
	playerId: string;
}

const sockets = new WeakMap<object, SocketState>();

async function authenticate(
	roomCode: string,
	request: Request,
): Promise<{ playerId: string; displayName: string } | null> {
	// Try cookie session first.
	const session = await auth.api
		.getSession({ headers: request.headers })
		.catch(() => null);

	if (session) {
		const rows = await db
			.select()
			.from(gamePlayerTable)
			.where(
				and(
					eq(gamePlayerTable.gameId, await gameIdForCode(roomCode)),
					eq(gamePlayerTable.userId, session.user.id),
				),
			)
			.limit(1);
		const row = rows[0];
		if (row) return { playerId: row.id, displayName: row.displayName };
	}

	// Try guest cookie scoped to this room.
	const cookieHeader = request.headers.get("cookie") ?? "";
	const match = cookieHeader.match(
		new RegExp(`guest_token_${roomCode}=([^;]+)`),
	);
	if (match) {
		const token = decodeURIComponent(match[1] ?? "");
		const rows = await db
			.select()
			.from(gamePlayerTable)
			.where(
				and(
					eq(gamePlayerTable.gameId, await gameIdForCode(roomCode)),
					eq(gamePlayerTable.guestToken, token),
					isNotNull(gamePlayerTable.guestToken),
				),
			)
			.limit(1);
		const row = rows[0];
		if (row) return { playerId: row.id, displayName: row.displayName };
	}

	return null;
}

const gameIdCache = new Map<string, string>();
async function gameIdForCode(roomCode: string): Promise<string> {
	const cached = gameIdCache.get(roomCode);
	if (cached) return cached;
	const driver = await getOrLoadRoom(roomCode);
	if (!driver) throw new Error(`Unknown room ${roomCode}`);
	// The driver already knows its state but not the row id; query it.
	const { game: gameTable } = await import("../db/schema.ts");
	const rows = await db
		.select({ id: gameTable.id })
		.from(gameTable)
		.where(eq(gameTable.roomCode, roomCode))
		.limit(1);
	const row = rows[0];
	if (!row) throw new Error(`Unknown game ${roomCode}`);
	const id = row.id;
	gameIdCache.set(roomCode, id);
	return id;
}

function intentFor(playerId: string, msg: ClientToServer): Intent | null {
	switch (msg.type) {
		case "start_game":
			return { type: "start_game", actorId: playerId };
		case "select_question":
			return {
				type: "select_question",
				actorId: playerId,
				questionRef: msg.questionRef,
			};
		case "open_question":
			return { type: "open_question", actorId: playerId, nowMs: Date.now() };
		case "close_question":
			return { type: "close_question", actorId: playerId };
		case "buzz":
			return { type: "buzz", actorId: playerId, nowMs: Date.now() };
		case "next_player":
			return { type: "next_player", actorId: playerId };
		case "judge":
			return { type: "judge", actorId: playerId, verdict: msg.verdict };
		case "set_picker":
			return { type: "set_picker", actorId: playerId, playerId: msg.playerId };
		case "adjust_score":
			return {
				type: "adjust_score",
				actorId: playerId,
				playerId: msg.playerId,
				delta: msg.delta,
			};
		case "update_settings":
			return {
				type: "update_settings",
				actorId: playerId,
				manualPoints: msg.manualPoints,
				allowReopen: msg.allowReopen,
				readDelayMs: msg.readDelayMs,
				finalEnabled: msg.finalEnabled,
				ddCount: msg.ddCount,
				shotsCount: msg.shotsCount,
			};
		case "wager":
			return { type: "wager", actorId: playerId, amount: msg.amount };
		case "start_final":
			return { type: "start_final", actorId: playerId };
		case "fj_wager":
			return { type: "fj_wager", actorId: playerId, amount: msg.amount };
		case "fj_answer":
			return { type: "fj_answer", actorId: playerId, text: msg.text };
		case "fj_judge":
			return {
				type: "fj_judge",
				actorId: playerId,
				playerId: msg.playerId,
				verdict: msg.verdict,
			};
		case "leave":
		case "ping":
			return null;
		default:
			return null;
	}
}

export const gamesWs = new Elysia().ws("/ws/games/:roomCode", {
	async open(ws) {
		const roomCode = (ws.data.params.roomCode ?? "").toUpperCase();
		const driver = await getOrLoadRoom(roomCode);
		if (!driver) {
			ws.close(4404, "Game not found");
			return;
		}

		const auth = await authenticate(
			roomCode,
			(ws.data as { request: Request }).request,
		);
		if (!auth) {
			ws.close(4403, "Not a member of this game");
			return;
		}

		const socketId = crypto.randomUUID();
		sockets.set(ws.raw as object, {
			roomCode,
			socketId,
			playerId: auth.playerId,
		});

		driver.registerSocket(
			{
				socketId,
				ws: { send: (s: string) => ws.send(s) },
				playerId: auth.playerId,
			},
			{ playerInfo: { id: auth.playerId, displayName: auth.displayName } },
		);

		ws.send(JSON.stringify(driver.snapshotFor(auth.playerId)));
		driver.pumpTimers();
	},

	async message(ws, raw) {
		const meta = sockets.get(ws.raw as object);
		if (!meta) {
			ws.close(4401, "No session");
			return;
		}
		let msg: ClientToServer;
		try {
			msg = (typeof raw === "string" ? JSON.parse(raw) : raw) as ClientToServer;
			if (!msg || typeof msg !== "object" || typeof msg.type !== "string")
				throw new Error("bad shape");
		} catch {
			ws.close(4400, "Bad message");
			return;
		}

		if (msg.type === "ping") {
			ws.send(JSON.stringify({ type: "pong" }));
			return;
		}
		if (msg.type === "leave") {
			ws.close(1000, "Leaving");
			return;
		}

		const driver = await getOrLoadRoom(meta.roomCode);
		if (!driver) {
			ws.close(4404, "Game not found");
			return;
		}

		const intent = intentFor(meta.playerId, msg);
		if (!intent) return;

		try {
			driver.handleIntent(intent);
		} catch (e) {
			if (e instanceof GameError) {
				ws.send(
					JSON.stringify({ type: "error", code: e.code, message: e.message }),
				);
			} else throw e;
		}
	},

	close(ws) {
		const meta = sockets.get(ws.raw as object);
		if (!meta) return;
		sockets.delete(ws.raw as object);
		void getOrLoadRoom(meta.roomCode).then((driver) =>
			driver?.unregisterSocket(meta.socketId),
		);
	},
});
