import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { app } from "../src/app.ts";
import { evictAllRooms, RoomDriver } from "../src/game/rooms.ts";
import { type GameState, newGame } from "../src/game/state.ts";
import { call, signUpAndGetCookie } from "./helpers.ts";

beforeAll(() => {
	app.listen(0);
});

afterAll(() => {
	evictAllRooms();
});

async function createUserGame(): Promise<{
	cookie: string;
	gameId: string;
	roomCode: string;
}> {
	const cookie = await signUpAndGetCookie("History User");
	const quizRes = await call("/quizzes", {
		method: "POST",
		headers: { "Content-Type": "application/json", cookie },
		body: JSON.stringify({ title: "Hist Quiz" }),
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
	return { cookie, gameId: game.id, roomCode: game.roomCode };
}

function completedState(roomCode: string): GameState {
	const s = newGame({
		roomCode,
		hostId: "u-host",
		hostPlayer: { id: "p-host", displayName: "Host" },
		board: { categories: [], questions: {} },
	});
	return {
		...s,
		phase: "completed",
		players: {
			...s.players,
			"p-1": {
				id: "p-1",
				displayName: "Alice",
				score: 700,
				status: "joined",
				isHost: false,
			},
			"p-2": {
				id: "p-2",
				displayName: "Bob",
				score: 100,
				status: "joined",
				isHost: false,
			},
		},
	};
}

describe("GET /games/:roomCode/result", () => {
	it("returns 404 for an unknown room code", async () => {
		const res = await call("/games/ZZZZZZ/result");
		expect(res.status).toBe(404);
	});

	it("returns 404 mid-game (mask-existence)", async () => {
		const { roomCode } = await createUserGame();
		const res = await call(`/games/${roomCode}/result`);
		expect(res.status).toBe(404);
	});

	it("returns persisted ranking after completion", async () => {
		const { gameId, roomCode } = await createUserGame();
		const driver = new RoomDriver(roomCode, completedState(roomCode), gameId);
		await driver.persistCompletion();

		const res = await call(`/games/${roomCode}/result`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			game: { roomCode: string; endedAt: string | null };
			ranking: { displayName: string; score: number; rank: number }[];
		};
		expect(body.game.roomCode).toBe(roomCode);
		expect(body.game.endedAt).not.toBeNull();
		expect(body.ranking.map((r) => r.displayName)).toEqual(["Alice", "Bob"]);
	});
});

describe("GET /games/history", () => {
	it("requires auth", async () => {
		const res = await call("/games/history");
		expect(res.status).toBe(401);
	});

	it("lists hosted games for the caller after completion", async () => {
		const { cookie, gameId, roomCode } = await createUserGame();
		const driver = new RoomDriver(roomCode, completedState(roomCode), gameId);
		await driver.persistCompletion();

		const res = await call("/games/history", { headers: { cookie } });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			games: {
				roomCode: string;
				role: "host" | "player";
				status: string;
				winner: { displayName: string; score: number } | null;
			}[];
		};
		const mine = body.games.find((g) => g.roomCode === roomCode);
		expect(mine).toBeDefined();
		expect(mine?.role).toBe("host");
		expect(mine?.status).toBe("completed");
		expect(mine?.winner?.displayName).toBe("Alice");
	});

	it("excludes in-progress games from history", async () => {
		const { cookie, roomCode } = await createUserGame();
		const res = await call("/games/history", { headers: { cookie } });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { games: { roomCode: string }[] };
		expect(body.games.find((g) => g.roomCode === roomCode)).toBeUndefined();
	});

	it("lists games where the caller joined as a logged-in player after completion", async () => {
		// Host creates a game.
		const hostCookie = await signUpAndGetCookie("Other Host");
		const quizRes = await call("/quizzes", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: hostCookie },
			body: JSON.stringify({ title: "Joined Quiz" }),
		});
		const { quiz } = (await quizRes.json()) as { quiz: { id: string } };
		const gameRes = await call("/games", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: hostCookie },
			body: JSON.stringify({ quizId: quiz.id }),
		});
		const { game } = (await gameRes.json()) as {
			game: { id: string; roomCode: string };
		};

		// A second authed user joins.
		const joinerCookie = await signUpAndGetCookie("Joiner");
		const joinRes = await call(`/games/${game.roomCode}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: joinerCookie },
			body: JSON.stringify({ displayName: "Joiner" }),
		});
		expect(joinRes.status).toBe(200);

		const driver = new RoomDriver(
			game.roomCode,
			completedState(game.roomCode),
			game.id,
		);
		await driver.persistCompletion();

		const histRes = await call("/games/history", {
			headers: { cookie: joinerCookie },
		});
		const body = (await histRes.json()) as {
			games: { roomCode: string; role: "host" | "player" }[];
		};
		const found = body.games.find((g) => g.roomCode === game.roomCode);
		expect(found).toBeDefined();
		expect(found?.role).toBe("player");
	});

	it("excludes games the caller has no relation to", async () => {
		// Host A creates a game.
		const hostA = await signUpAndGetCookie("HostA");
		const quizRes = await call("/quizzes", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: hostA },
			body: JSON.stringify({ title: "Other Quiz" }),
		});
		const { quiz } = (await quizRes.json()) as { quiz: { id: string } };
		const gameRes = await call("/games", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: hostA },
			body: JSON.stringify({ quizId: quiz.id }),
		});
		const { game } = (await gameRes.json()) as { game: { roomCode: string } };

		// Unrelated user B.
		const userB = await signUpAndGetCookie("UserB");
		const histRes = await call("/games/history", {
			headers: { cookie: userB },
		});
		const body = (await histRes.json()) as {
			games: { roomCode: string }[];
		};
		expect(
			body.games.find((g) => g.roomCode === game.roomCode),
		).toBeUndefined();
	});
});
