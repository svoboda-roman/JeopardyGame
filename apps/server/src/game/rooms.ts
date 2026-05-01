import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	gamePlayer as gamePlayerTable,
	gameResult as gameResultTable,
	gameSnapshot as gameSnapshotTable,
	game as gameTable,
} from "../db/schema.ts";
import type { PersistedSnapshot } from "../routes/games.ts";
import type { ServerToClient } from "./protocol.ts";
import {
	addPlayer,
	GameError,
	type GameState,
	type Intent,
	type InternalBoard,
	type InternalFinalQuestion,
	newGame,
	projectView,
	setPlayerStatus,
	tickReadDelay,
	transition,
} from "./state.ts";

// Minimal contract our handler needs from a connected socket.
export interface RoomSocket {
	send(data: string): unknown;
}

interface SocketEntry {
	socketId: string;
	ws: RoomSocket;
	playerId: string;
}

export interface RankingEntry {
	playerId: string;
	displayName: string;
	score: number;
	rank: number;
}

export class RoomDriver {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private sockets = new Map<string, SocketEntry>();
	private completionPersisted = false;

	constructor(
		public roomCode: string,
		private state: GameState,
		private gameId: string,
	) {}

	/** Snapshot for a freshly connected client (sent only to that socket). */
	snapshotFor(playerId: string): ServerToClient {
		return {
			type: "snapshot",
			game: projectView(this.state),
			you: { playerId },
		};
	}

	/** Persist a join (state-machine), broadcast, and return the snapshot. */
	registerSocket(
		entry: SocketEntry,
		opts: { playerInfo: { id: string; displayName: string } },
	) {
		// Best-effort addPlayer; if already there this is a no-op.
		try {
			const r = addPlayer(this.state, opts.playerInfo);
			this.state = r.state;
			this.broadcast(r.broadcasts);
		} catch (e) {
			if (e instanceof GameError) {
				// Don't surface to the room; the joining client just won't see player_joined.
			} else throw e;
		}
		// If player previously disconnected, mark them back as joined.
		if (this.state.players[opts.playerInfo.id]?.status === "disconnected") {
			const r = setPlayerStatus(this.state, opts.playerInfo.id, "joined");
			this.state = r.state;
			this.broadcast(r.broadcasts);
		}
		this.sockets.set(entry.socketId, entry);
	}

	unregisterSocket(socketId: string) {
		const entry = this.sockets.get(socketId);
		if (!entry) return;
		this.sockets.delete(socketId);
		// If no other socket holds this player, mark disconnected.
		const stillHere = [...this.sockets.values()].some(
			(s) => s.playerId === entry.playerId,
		);
		if (!stillHere && this.state.players[entry.playerId]) {
			try {
				const r = setPlayerStatus(this.state, entry.playerId, "disconnected");
				this.state = r.state;
				this.broadcast(r.broadcasts);
			} catch {
				// ignore
			}
		}
	}

	handleIntent(intent: Intent) {
		const r = transition(this.state, intent);
		this.state = r.state;
		this.broadcast(r.broadcasts);
		this.scheduleTick();
		this.maybePersistCompletion();
	}

	/** Called externally when wall-clock advances, in case our timer was missed. */
	pumpTimers(nowMs: number = Date.now()) {
		const r = tickReadDelay(this.state, nowMs);
		if (r.state !== this.state) {
			this.state = r.state;
			this.broadcast(r.broadcasts);
			this.maybePersistCompletion();
		}
	}

	/**
	 * When the game enters `completed`, write `game.endedAt` and the
	 * final ranking row. Idempotent across processes via primary-key
	 * conflict on `game_result.game_id`. Awaitable for tests.
	 */
	persistCompletion(): Promise<void> {
		if (this.state.phase !== "completed") return Promise.resolve();
		if (this.completionPersisted) return Promise.resolve();
		this.completionPersisted = true;
		const ranking = computeRanking(this.state);
		const gameId = this.gameId;
		return (async () => {
			await db.transaction(async (tx) => {
				await tx
					.update(gameTable)
					.set({ endedAt: sql`now()` })
					.where(
						sql`${gameTable.id} = ${gameId} AND ${gameTable.endedAt} IS NULL`,
					);
				await tx
					.insert(gameResultTable)
					.values({ gameId, ranking })
					.onConflictDoNothing();
			});
		})();
	}

	private maybePersistCompletion() {
		// Fire-and-forget; failures are logged but don't break the room.
		this.persistCompletion().catch((err) => {
			console.error(`[room ${this.roomCode}] persistCompletion failed`, err);
			this.completionPersisted = false;
		});
	}

	/** Stop pending timers — used when the room is evicted. */
	dispose() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	// For tests / inspection only.
	getState(): GameState {
		return this.state;
	}

	private scheduleTick() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.state.phase !== "reading" || this.state.buzzOpensAtMs === null)
			return;
		const delay = Math.max(0, this.state.buzzOpensAtMs - Date.now());
		this.timer = setTimeout(() => {
			this.timer = null;
			this.pumpTimers();
		}, delay);
	}

	private broadcast(messages: ServerToClient[]) {
		if (messages.length === 0) return;
		for (const entry of this.sockets.values()) {
			for (const m of messages) {
				try {
					entry.ws.send(JSON.stringify(m));
				} catch {
					// socket may be closing; ignore
				}
			}
		}
	}
}

/**
 * Snapshot column may hold either the legacy `InternalBoard` (pre-FJ
 * games) or the new `PersistedSnapshot = { board, finalQuestion }`.
 */
function readSnapshot(raw: unknown): {
	board: InternalBoard;
	finalQuestion: InternalFinalQuestion | null;
} {
	const v = raw as PersistedSnapshot | InternalBoard;
	if (v && typeof v === "object" && "board" in v) {
		const s = v as PersistedSnapshot;
		return { board: s.board, finalQuestion: s.finalQuestion ?? null };
	}
	return { board: v as InternalBoard, finalQuestion: null };
}

function computeRanking(state: GameState): RankingEntry[] {
	const players = Object.values(state.players)
		.filter((p) => !p.isHost)
		.sort(
			(a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
		);
	let lastScore: number | null = null;
	let lastRank = 0;
	return players.map((p, i) => {
		const rank = lastScore === p.score ? lastRank : i + 1;
		lastScore = p.score;
		lastRank = rank;
		return {
			playerId: p.id,
			displayName: p.displayName,
			score: p.score,
			rank,
		};
	});
}

const rooms = new Map<string, RoomDriver>();
const inflightLoads = new Map<string, Promise<RoomDriver>>();

export async function getOrLoadRoom(
	roomCode: string,
): Promise<RoomDriver | null> {
	const existing = rooms.get(roomCode);
	if (existing) return existing;
	const inflight = inflightLoads.get(roomCode);
	if (inflight) return inflight;

	const promise = (async () => {
		const games = await db
			.select()
			.from(gameTable)
			.where(eq(gameTable.roomCode, roomCode))
			.limit(1);
		const g = games[0];
		if (!g) return null;

		const snap = await db
			.select()
			.from(gameSnapshotTable)
			.where(eq(gameSnapshotTable.gameId, g.id))
			.limit(1);
		const snapRow = snap[0];
		if (!snapRow) return null;
		const { board, finalQuestion } = readSnapshot(snapRow.quiz);

		const players = await db
			.select()
			.from(gamePlayerTable)
			.where(eq(gamePlayerTable.gameId, g.id));

		// Find the host player slot (host_id matches user_id).
		const hostPlayer = players.find((p) => p.userId === g.hostId);
		if (!hostPlayer) return null;

		let state = newGame({
			roomCode: g.roomCode,
			hostId: g.hostId,
			hostPlayer: { id: hostPlayer.id, displayName: hostPlayer.displayName },
			board,
			finalQuestion,
			options:
				(g.options as { readDelayMs?: number; finalEnabled?: boolean }) ?? {},
		});

		// Hydrate remaining players.
		for (const p of players) {
			if (p.id === hostPlayer.id) continue;
			const r = addPlayer(state, { id: p.id, displayName: p.displayName });
			state = r.state;
			// Mark left/kicked accordingly.
			if (p.status !== "joined") {
				const r2 = setPlayerStatus(
					state,
					p.id,
					p.status as "left" | "kicked" | "disconnected",
				);
				state = r2.state;
			}
		}

		const driver = new RoomDriver(g.roomCode, state, g.id);
		rooms.set(g.roomCode, driver);
		return driver;
	})();

	inflightLoads.set(roomCode, promise as Promise<RoomDriver>);
	try {
		const result = await promise;
		return result;
	} finally {
		inflightLoads.delete(roomCode);
	}
}

export function evictRoom(roomCode: string) {
	const r = rooms.get(roomCode);
	if (!r) return;
	r.dispose();
	rooms.delete(roomCode);
}

/** Tests / shutdown: drop all in-memory rooms (and their timers). */
export function evictAllRooms() {
	for (const r of rooms.values()) r.dispose();
	rooms.clear();
}
