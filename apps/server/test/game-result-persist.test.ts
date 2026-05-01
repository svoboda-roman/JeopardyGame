import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../src/app.ts";
import { db } from "../src/db/client.ts";
import {
	gameResult as gameResultTable,
	game as gameTable,
} from "../src/db/schema.ts";
import {
	evictAllRooms,
	type RankingEntry,
	RoomDriver,
} from "../src/game/rooms.ts";
import { type GameState, newGame } from "../src/game/state.ts";
import { call, signUpAndGetCookie } from "./helpers.ts";

beforeAll(() => {
	app.listen(0);
});

afterAll(() => {
	evictAllRooms();
});

async function setupGame(): Promise<{ gameId: string; roomCode: string }> {
	const cookie = await signUpAndGetCookie("Persist Host");
	const quizRes = await call("/quizzes", {
		method: "POST",
		headers: { "Content-Type": "application/json", cookie },
		body: JSON.stringify({ title: "Persist Quiz" }),
	});
	const { quiz } = (await quizRes.json()) as { quiz: { id: string } };
	const gameRes = await call("/games", {
		method: "POST",
		headers: { "Content-Type": "application/json", cookie },
		body: JSON.stringify({ quizId: quiz.id, options: { readDelayMs: 50 } }),
	});
	const { game } = (await gameRes.json()) as {
		game: { id: string; roomCode: string };
	};
	return { gameId: game.id, roomCode: game.roomCode };
}

function completedState(roomCode: string): GameState {
	const state = newGame({
		roomCode,
		hostId: "u-host",
		hostPlayer: { id: "p-host", displayName: "Host" },
		board: { categories: [], questions: {} },
		options: { readDelayMs: 50 },
	});
	return {
		...state,
		phase: "completed",
		players: {
			...state.players,
			"p-1": {
				id: "p-1",
				displayName: "Alice",
				score: 500,
				status: "joined",
				isHost: false,
			},
			"p-2": {
				id: "p-2",
				displayName: "Bob",
				score: 200,
				status: "joined",
				isHost: false,
			},
			"p-3": {
				id: "p-3",
				displayName: "Carol",
				score: 200,
				status: "joined",
				isHost: false,
			},
		},
	};
}

describe("RoomDriver.persistCompletion", () => {
	it("writes endedAt + game_result with ranking on first call; idempotent on second", async () => {
		const { gameId, roomCode } = await setupGame();
		const driver = new RoomDriver(roomCode, completedState(roomCode), gameId);

		await driver.persistCompletion();

		const [g] = await db
			.select()
			.from(gameTable)
			.where(eq(gameTable.id, gameId));
		expect(g?.endedAt).not.toBeNull();
		const endedAtFirst = g?.endedAt;

		const [resultRow] = await db
			.select()
			.from(gameResultTable)
			.where(eq(gameResultTable.gameId, gameId));
		expect(resultRow).toBeDefined();
		const ranking = resultRow?.ranking as RankingEntry[];
		expect(ranking.map((r) => r.displayName)).toEqual([
			"Alice",
			"Bob",
			"Carol",
		]);
		expect(ranking.map((r) => r.score)).toEqual([500, 200, 200]);
		// Tied scores share rank.
		expect(ranking.map((r) => r.rank)).toEqual([1, 2, 2]);
		// Excludes the host.
		expect(ranking.find((r) => r.playerId === "p-host")).toBeUndefined();

		// Second call: no-op (won't bump endedAt or duplicate row).
		await driver.persistCompletion();
		const rows = await db
			.select()
			.from(gameResultTable)
			.where(eq(gameResultTable.gameId, gameId));
		expect(rows.length).toBe(1);
		const [g2] = await db
			.select()
			.from(gameTable)
			.where(eq(gameTable.id, gameId));
		expect(g2?.endedAt?.getTime()).toBe(endedAtFirst?.getTime());
	});

	it("a fresh driver for the same game still no-ops the insert (cross-process idempotency)", async () => {
		const { gameId, roomCode } = await setupGame();
		const a = new RoomDriver(roomCode, completedState(roomCode), gameId);
		await a.persistCompletion();

		// Simulate a restart: brand new driver instance, fresh in-memory flag.
		const b = new RoomDriver(roomCode, completedState(roomCode), gameId);
		await b.persistCompletion();

		const rows = await db
			.select()
			.from(gameResultTable)
			.where(eq(gameResultTable.gameId, gameId));
		expect(rows.length).toBe(1);
	});

	it("does nothing when the state is not completed", async () => {
		const { gameId, roomCode } = await setupGame();
		const state = newGame({
			roomCode,
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: { categories: [], questions: {} },
		});
		const driver = new RoomDriver(roomCode, state, gameId);
		await driver.persistCompletion();

		const rows = await db
			.select()
			.from(gameResultTable)
			.where(eq(gameResultTable.gameId, gameId));
		expect(rows.length).toBe(0);
		const [g] = await db
			.select()
			.from(gameTable)
			.where(eq(gameTable.id, gameId));
		expect(g?.endedAt).toBeNull();
	});
});
