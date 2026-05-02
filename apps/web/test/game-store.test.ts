import type { GameView, ServerToClient } from "server/src/game/protocol.ts";
import { describe, expect, it } from "vitest";
import { createGameStore } from "#/stores/game.ts";

function baseGame(): GameView {
	return {
		roomCode: "ABCDEF",
		hostId: "u-host",
		phase: "lobby",
		players: [
			{
				id: "p-host",
				displayName: "Host",
				score: 0,
				status: "joined",
				isHost: true,
			},
			{
				id: "p1",
				displayName: "P1",
				score: 0,
				status: "joined",
				isHost: false,
			},
		],
		board: [
			{
				ref: "c1",
				position: 0,
				title: "Cat 1",
				questions: [
					{ ref: "q1", position: 0, pointValue: 100, closed: false },
					{ ref: "q2", position: 1, pointValue: 200, closed: false },
				],
			},
		],
		currentQuestion: null,
		buzzOpensAt: null,
		currentPlayerId: null,
		currentPickerId: null,
		currentWager: null,
		finalJeopardy: null,
	};
}

function snap(): ServerToClient {
	return { type: "snapshot", game: baseGame(), you: { playerId: "p1" } };
}

describe("game store reducer", () => {
	it("snapshot hydrates the store", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		expect(store.getState().game?.roomCode).toBe("ABCDEF");
		expect(store.getState().selfPlayerId).toBe("p1");
	});

	it("game_started flips phase to picking", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({ type: "game_started" });
		expect(store.getState().game?.phase).toBe("picking");
	});

	it("question_open sets currentQuestion + reading phase", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({
			type: "question_open",
			question: {
				ref: "q1",
				categoryRef: "c1",
				pointValue: 100,
				isDailyDouble: false,
				clue: "A clue",
				answer: "An answer",
			},
			opensBuzzAt: "2026-04-30T05:00:00.000Z",
		});
		const g = store.getState().game!;
		expect(g.phase).toBe("reading");
		expect(g.currentQuestion?.clue).toBe("A clue");
	});

	it("buzzed sets currentPlayerId and phase", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({ type: "buzzed", playerId: "p1" });
		expect(store.getState().game?.currentPlayerId).toBe("p1");
		expect(store.getState().game?.phase).toBe("buzzed");
	});

	it("judged updates the right player score", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({
			type: "judged",
			playerId: "p1",
			verdict: "correct",
			scoreDelta: 100,
			newScore: 100,
		});
		const p = store.getState().game?.players.find((p) => p.id === "p1");
		expect(p?.score).toBe(100);
	});

	it("question_closed marks the question closed and exits the question phase", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({ type: "game_started" });
		store.getState().apply({
			type: "question_open",
			question: {
				ref: "q1",
				categoryRef: "c1",
				pointValue: 100,
				isDailyDouble: false,
				clue: "A",
				answer: "a",
			},
			opensBuzzAt: "x",
		});
		store.getState().apply({ type: "question_closed", questionRef: "q1" });
		const g = store.getState().game!;
		expect(g.phase).toBe("picking");
		expect(g.currentQuestion).toBeNull();
		const closedRef = g.board[0]!.questions.find((q) => q.ref === "q1")!;
		expect(closedRef.closed).toBe(true);
	});

	it("daily_double_pending sets ddPending and dd_wagering phase", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({
			type: "daily_double_pending",
			pickerId: "p1",
			categoryRef: "c1",
			min: 5,
			max: 1000,
		});
		expect(store.getState().game?.phase).toBe("dd_wagering");
		expect(store.getState().ddPending).toEqual({
			pickerId: "p1",
			categoryRef: "c1",
			min: 5,
			max: 1000,
		});
	});

	it("clue_revealed clears ddPending and reveals question with wager", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({
			type: "daily_double_pending",
			pickerId: "p1",
			categoryRef: "c1",
			min: 5,
			max: 1000,
		});
		store.getState().apply({
			type: "clue_revealed",
			question: {
				ref: "q1",
				categoryRef: "c1",
				pointValue: 100,
				isDailyDouble: true,
				clue: "DD clue",
				answer: "DD answer",
			},
			wager: 500,
			pickerId: "p1",
		});
		const g = store.getState().game!;
		expect(g.phase).toBe("buzzed");
		expect(g.currentWager).toBe(500);
		expect(g.currentPlayerId).toBe("p1");
		expect(g.currentQuestion?.clue).toBe("DD clue");
		expect(store.getState().ddPending).toBeNull();
	});

	it("fj_started seeds finalJeopardy and tracks eligibility", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store
			.getState()
			.apply({ type: "fj_started", category: "Geography", eligible: ["p1"] });
		const g = store.getState().game!;
		expect(g.phase).toBe("fj_wager");
		expect(g.finalJeopardy?.category).toBe("Geography");
		expect(store.getState().fjEligible).toEqual(["p1"]);
	});

	it("picker_changed updates currentPickerId", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store.getState().apply({ type: "picker_changed", playerId: "p1" });
		expect(store.getState().game?.currentPickerId).toBe("p1");
	});

	it("error message is captured", () => {
		const store = createGameStore();
		store.getState().apply(snap());
		store
			.getState()
			.apply({ type: "error", code: "early_buzz", message: "too soon" });
		expect(store.getState().lastError?.code).toBe("early_buzz");
	});
});
