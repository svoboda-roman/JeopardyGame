import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import {
	gameSnapshot as gameSnapshotTable,
	game as gameTable,
} from "../src/db/schema.ts";
import { call, signUpAndGetCookie } from "./helpers.ts";

async function freshHost() {
	return signUpAndGetCookie("Host User");
}

async function createQuiz(c: string, title = "For Game") {
	const res = await call("/quizzes", {
		method: "POST",
		headers: { "Content-Type": "application/json", cookie: c },
		body: JSON.stringify({ title }),
	});
	expect(res.status).toBe(201);
	return ((await res.json()) as { quiz: { id: string } }).quiz;
}

async function createGame(quizId: string, c: string) {
	return call("/games", {
		method: "POST",
		headers: { "Content-Type": "application/json", cookie: c },
		body: JSON.stringify({ quizId }),
	});
}

describe("POST /games", () => {
	it("rejects anonymous", async () => {
		const res = await call("/games", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ quizId: "whatever" }),
		});
		expect(res.status).toBe(401);
	});

	it("rejects when quiz is not owned by caller", async () => {
		const owner = await freshHost();
		const intruder = await freshHost();
		const theirs = await createQuiz(owner);
		const res = await createGame(theirs.id, intruder);
		expect(res.status).toBe(404);
	});

	it("creates a game with a snapshot and a unique room code", async () => {
		const host = await freshHost();
		const quiz = await createQuiz(host);
		const res = await createGame(quiz.id, host);
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			game: { id: string; roomCode: string };
		};
		expect(body.game.roomCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXYZ]{6}$/);

		const lookup = await call(`/games/${body.game.roomCode}`);
		expect(lookup.status).toBe(200);
		const detail = (await lookup.json()) as {
			game: { roomCode: string; status: string };
		};
		expect(detail.game.status).toBe("lobby");
	});

	it("adds the requested number of random extra Daily Doubles", async () => {
		const host = await freshHost();
		const quiz = await createQuiz(host, "DD Quiz");
		const res = await call("/games", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: host },
			body: JSON.stringify({ quizId: quiz.id, options: { ddCount: 4 } }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { game: { id: string } };
		const snap = (
			await db
				.select({ quiz: gameSnapshotTable.quiz })
				.from(gameSnapshotTable)
				.innerJoin(gameTable, eq(gameTable.id, gameSnapshotTable.gameId))
				.where(eq(gameTable.id, body.game.id))
				.limit(1)
		)[0];
		const stored = snap?.quiz as {
			board: { questions: Record<string, { isDailyDouble: boolean }> };
		};
		const dds = Object.values(stored.board.questions).filter(
			(q) => q.isDailyDouble,
		);
		// Fresh quizzes author 0 DDs, so ddCount=4 should give exactly 4.
		expect(dds.length).toBe(4);
	});

	it("auto-aborts the prior in-flight game when the host starts a new one", async () => {
		const host = await freshHost();
		const quiz = await createQuiz(host);
		const a = await createGame(quiz.id, host);
		expect(a.status).toBe(201);
		const aBody = (await a.json()) as { game: { roomCode: string } };
		const b = await createGame(quiz.id, host);
		expect(b.status).toBe(201);
		const bBody = (await b.json()) as { game: { roomCode: string } };
		expect(bBody.game.roomCode).not.toBe(aBody.game.roomCode);

		const prior = await call(`/games/${aBody.game.roomCode}`);
		expect(prior.status).toBe(200);
		const priorDetail = (await prior.json()) as {
			game: { status: string };
		};
		expect(priorDetail.game.status).toBe("aborted");
	});
});

describe("POST /games/:roomCode/join", () => {
	async function setupGame() {
		const host = await freshHost();
		const quiz = await createQuiz(host, "Open Quiz");
		const res = await createGame(quiz.id, host);
		expect(res.status).toBe(201);
		return ((await res.json()) as { game: { roomCode: string } }).game.roomCode;
	}

	it("lets a guest join (no cookie) and returns Set-Cookie for guest_token", async () => {
		const code = await setupGame();
		const res = await call(`/games/${code}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ displayName: "Guesty" }),
		});
		expect(res.status).toBe(200);
		const setCookies =
			typeof (res.headers as Headers & { getSetCookie?: () => string[] })
				.getSetCookie === "function"
				? (
						res.headers as Headers & { getSetCookie: () => string[] }
					).getSetCookie()
				: [res.headers.get("set-cookie") ?? ""];
		expect(setCookies.some((c) => c.includes(`guest_token_${code}`))).toBe(
			true,
		);
	});

	it("a logged-in user joins idempotently (rejoin returns same playerId)", async () => {
		const code = await setupGame();
		const player = await freshHost();
		const a = await call(`/games/${code}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: player },
			body: JSON.stringify({ displayName: "Logged In" }),
		});
		const aBody = (await a.json()) as { playerId: string };
		const b = await call(`/games/${code}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: player },
			body: JSON.stringify({ displayName: "Logged In" }),
		});
		const bBody = (await b.json()) as { playerId: string };
		expect(aBody.playerId).toBe(bBody.playerId);
	});

	it("rejects unknown room code with 404", async () => {
		const res = await call("/games/ZZZZZZ/join", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ displayName: "X" }),
		});
		expect(res.status).toBe(404);
	});

	it("rejects with 409 when capacity is hit", async () => {
		const code = await setupGame();
		// host slot already exists; cap is 6 → fill 5 more
		for (let i = 0; i < 5; i++) {
			const r = await call(`/games/${code}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ displayName: `G${i}` }),
			});
			expect(r.status).toBe(200);
		}
		const overflow = await call(`/games/${code}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ displayName: "too late" }),
		});
		expect(overflow.status).toBe(409);
	});
});
