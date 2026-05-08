import { beforeEach, describe, expect, it } from "bun:test";
import {
	addPlayer,
	ddWagerBounds,
	GameError,
	type GameState,
	type InternalBoard,
	newGame,
	tickReadDelay,
	transition,
} from "../src/game/state.ts";

function tinyBoard(): InternalBoard {
	// 1 category, 2 questions for fast tests.
	return {
		categories: [
			{ ref: "c1", position: 0, title: "Test", questionRefs: ["q1", "q2"] },
		],
		questions: {
			q1: {
				ref: "q1",
				categoryRef: "c1",
				position: 0,
				pointValue: 100,
				isDailyDouble: false,
				isShot: false,
				clue: "clue 1",
				answer: "answer 1",
				media: [],
				answerMedia: [],
				youtubeId: null,
				answerYoutubeId: null,
				hostNotes: null,
				buzzWindowMs: null,
			},
			q2: {
				ref: "q2",
				categoryRef: "c1",
				position: 1,
				pointValue: 200,
				isDailyDouble: false,
				isShot: false,
				clue: "clue 2",
				answer: "answer 2",
				media: [],
				answerMedia: [],
				youtubeId: null,
				answerYoutubeId: null,
				hostNotes: null,
				buzzWindowMs: null,
			},
		},
	};
}

let state: GameState;

beforeEach(() => {
	state = newGame({
		roomCode: "ABCDEF",
		hostId: "u-host",
		hostPlayer: { id: "p-host", displayName: "Host" },
		board: tinyBoard(),
		options: { readDelayMs: 1000 },
	});
});

describe("lobby + start", () => {
	it("cannot start without ≥ 1 non-host player", () => {
		expect(() =>
			transition(state, { type: "start_game", actorId: "p-host" }),
		).toThrow(GameError);
	});

	it("non-host cannot start", () => {
		const r = addPlayer(state, { id: "p1", displayName: "P1" });
		expect(() =>
			transition(r.state, { type: "start_game", actorId: "p1" }),
		).toThrow(GameError);
	});

	it("host with 1 player → picking + game_started + picker is a non-host player", () => {
		state = addPlayer(state, { id: "p1", displayName: "P1" }).state;
		const r = transition(state, { type: "start_game", actorId: "p-host" });
		expect(r.state.phase).toBe("picking");
		expect(r.state.currentPickerId).toBe("p1");
		expect(r.broadcasts.some((b) => b.type === "game_started")).toBe(true);
		expect(
			r.broadcasts.some(
				(b) => b.type === "picker_changed" && b.playerId === "p1",
			),
		).toBe(true);
	});

	it("sprinkles ddCount random Daily Doubles at start_game", () => {
		// Build a 6×5 board so there's room for several DDs.
		const cats = Array.from({ length: 6 }, (_, c) => ({
			ref: `c${c}`,
			position: c,
			title: `Cat ${c}`,
			questionRefs: Array.from({ length: 5 }, (_, q) => `c${c}q${q}`),
		}));
		const questions: Record<string, InternalBoard["questions"][string]> = {};
		for (const c of cats) {
			for (let q = 0; q < 5; q++) {
				const ref = `${c.ref}q${q}`;
				questions[ref] = {
					ref,
					categoryRef: c.ref,
					position: q,
					pointValue: (q + 1) * 100,
					isDailyDouble: false,
					isShot: false,
					clue: "",
					answer: "",
					media: [],
					answerMedia: [],
					youtubeId: null,
					answerYoutubeId: null,
					hostNotes: null,
					buzzWindowMs: null,
				};
			}
		}
		let s = newGame({
			roomCode: "DDDDDD",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: { categories: cats, questions },
			options: { ddCount: 4 },
		});
		s = addPlayer(s, { id: "p1", displayName: "P1" }).state;
		const before = Object.values(s.board.questions).filter(
			(q) => q.isDailyDouble,
		).length;
		expect(before).toBe(0);
		const r = transition(s, { type: "start_game", actorId: "p-host" });
		const after = Object.values(r.state.board.questions).filter(
			(q) => q.isDailyDouble,
		).length;
		expect(after).toBe(4);
	});

	it("sprinkles shotsCount random shots disjoint from Daily Doubles", () => {
		const cats = Array.from({ length: 6 }, (_, c) => ({
			ref: `c${c}`,
			position: c,
			title: `Cat ${c}`,
			questionRefs: Array.from({ length: 5 }, (_, q) => `c${c}q${q}`),
		}));
		const questions: Record<string, InternalBoard["questions"][string]> = {};
		for (const c of cats) {
			for (let q = 0; q < 5; q++) {
				const ref = `${c.ref}q${q}`;
				questions[ref] = {
					ref,
					categoryRef: c.ref,
					position: q,
					pointValue: (q + 1) * 100,
					isDailyDouble: false,
					isShot: false,
					clue: "",
					answer: "",
					media: [],
					answerMedia: [],
					youtubeId: null,
					answerYoutubeId: null,
					hostNotes: null,
					buzzWindowMs: null,
				};
			}
		}
		let s = newGame({
			roomCode: "SHOTSS",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: { categories: cats, questions },
			options: { ddCount: 3, shotsCount: 4 },
		});
		s = addPlayer(s, { id: "p1", displayName: "P1" }).state;
		const r = transition(s, { type: "start_game", actorId: "p-host" });
		const all = Object.values(r.state.board.questions);
		const dds = all.filter((q) => q.isDailyDouble);
		const shots = all.filter((q) => q.isShot);
		expect(dds.length).toBe(3);
		expect(shots.length).toBe(4);
		expect(dds.some((q) => q.isShot)).toBe(false);
	});
});

describe("one-question buzz cycle", () => {
	beforeEach(() => {
		state = addPlayer(state, { id: "p1", displayName: "P1" }).state;
		state = addPlayer(state, { id: "p2", displayName: "P2" }).state;
		state = transition(state, { type: "start_game", actorId: "p-host" }).state;
		// Pin the picker to p2 so a correct answer from p1 always triggers picker_changed.
		state = transition(state, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p2",
		}).state;
		state = transition(state, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q1",
		}).state;
		state = transition(state, {
			type: "open_question",
			actorId: "p-host",
			nowMs: 1000,
		}).state;
		// phase is now 'reading', buzzOpensAtMs = 2000
	});

	it("early buzz during reading → no transition + lockout + error broadcast", () => {
		const r = transition(state, { type: "buzz", actorId: "p1", nowMs: 1500 });
		expect(r.state.phase).toBe("reading");
		expect(r.state.lockedOutOnCurrent.has("p1")).toBe(true);
		expect(r.broadcasts.some((b) => b.type === "error")).toBe(true);
	});

	it("tick at buzzOpensAt → buzz_open + buzz_open broadcast", () => {
		const r = tickReadDelay(state, 2000);
		expect(r.state.phase).toBe("buzz_open");
		expect(r.broadcasts.some((b) => b.type === "buzz_open")).toBe(true);
	});

	it("buzz after open → buzzed + currentPlayerId set", () => {
		state = tickReadDelay(state, 2000).state;
		const r = transition(state, { type: "buzz", actorId: "p1", nowMs: 2050 });
		expect(r.state.phase).toBe("buzzed");
		expect(r.state.currentPlayerId).toBe("p1");
		expect(
			r.broadcasts.some((b) => b.type === "buzzed" && b.playerId === "p1"),
		).toBe(true);
	});

	it("locked-out player cannot buzz after open", () => {
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 1500,
		}).state;
		state = tickReadDelay(state, 2000).state;
		expect(() =>
			transition(state, { type: "buzz", actorId: "p1", nowMs: 2050 }),
		).toThrow(GameError);
	});

	it("second buzz while buzzed → queued, no phase change", () => {
		state = tickReadDelay(state, 2000).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		const r = transition(state, { type: "buzz", actorId: "p2", nowMs: 2060 });
		expect(r.state.phase).toBe("buzzed");
		expect(r.state.currentPlayerId).toBe("p1");
		expect(r.state.buzzQueue).toEqual(["p2"]);
		expect(
			r.broadcasts.some(
				(b) => b.type === "buzz_queue_updated" && b.queue.includes("p2"),
			),
		).toBe(true);
	});

	it("host cannot buzz", () => {
		state = tickReadDelay(state, 2000).state;
		expect(() =>
			transition(state, { type: "buzz", actorId: "p-host", nowMs: 2050 }),
		).toThrow(GameError);
	});

	it("judge correct → score+; closes question; picker rotates to answerer", () => {
		state = tickReadDelay(state, 2000).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		const r = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "correct",
		});
		expect(r.state.phase).toBe("picking");
		expect(r.state.players.p1?.score).toBe(100);
		expect(r.state.closedQuestions.has("q1")).toBe(true);
		expect(r.state.currentPickerId).toBe("p1");
		const judged = r.broadcasts.find((b) => b.type === "judged");
		expect(judged).toMatchObject({
			playerId: "p1",
			verdict: "correct",
			scoreDelta: 100,
			newScore: 100,
		});
		expect(
			r.broadcasts.some(
				(b) => b.type === "picker_changed" && b.playerId === "p1",
			),
		).toBe(true);
	});

	it("judge incorrect with eligible players left → re-buzz (question stays open)", () => {
		state = tickReadDelay(state, 2000).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		const r = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "incorrect",
		});
		expect(r.state.players.p1?.score).toBe(-100);
		expect(r.state.phase).toBe("buzz_open");
		expect(r.state.closedQuestions.has("q1")).toBe(false);
		expect(r.state.lockedOutOnCurrent.has("p1")).toBe(true);
		expect(r.broadcasts.some((b) => b.type === "buzz_open")).toBe(true);
		// p1 cannot re-buzz on the same question
		expect(() =>
			transition(r.state, { type: "buzz", actorId: "p1", nowMs: 3000 }),
		).toThrow(GameError);
		// p2 still can
		const r2 = transition(r.state, {
			type: "buzz",
			actorId: "p2",
			nowMs: 3010,
		});
		expect(r2.state.phase).toBe("buzzed");
		expect(r2.state.currentPlayerId).toBe("p2");
	});

	it("judge no_answer with no eligible players left → close question", () => {
		state = tickReadDelay(state, 2000).state;
		// p1 buzzes, gets judged no_answer
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		state = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "no_answer",
		}).state;
		expect(state.phase).toBe("buzz_open");
		// p2 buzzes, gets judged no_answer too — now no eligible players left
		state = transition(state, {
			type: "buzz",
			actorId: "p2",
			nowMs: 3000,
		}).state;
		const r = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "no_answer",
		});
		expect(r.state.closedQuestions.has("q1")).toBe(true);
		expect(r.state.phase).toBe("picking");
	});

	it("set_picker (host) overrides the picker; non-host cannot", () => {
		state = tickReadDelay(state, 2000).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		state = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "correct",
		}).state;
		// Picker rotated to p1; host overrides to p2.
		const r = transition(state, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p2",
		});
		expect(r.state.currentPickerId).toBe("p2");
		expect(
			r.broadcasts.some(
				(b) => b.type === "picker_changed" && b.playerId === "p2",
			),
		).toBe(true);
		// p1 can't override.
		expect(() =>
			transition(r.state, {
				type: "set_picker",
				actorId: "p1",
				playerId: "p1",
			}),
		).toThrow(GameError);
	});

	it("the current picker (non-host) may select a question; other players cannot", () => {
		// After p1 answers correctly, p1 becomes picker.
		state = tickReadDelay(state, 2000).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		state = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "correct",
		}).state;
		expect(state.currentPickerId).toBe("p1");
		// p2 may not select.
		expect(() =>
			transition(state, {
				type: "select_question",
				actorId: "p2",
				questionRef: "q2",
			}),
		).toThrow(GameError);
		// p1 may.
		const r = transition(state, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q2",
		});
		expect(r.state.currentQuestionRef).toBe("q2");
	});
});

describe("buy_drink", () => {
	let s: GameState;
	beforeEach(() => {
		s = newGame({
			roomCode: "DRINKS",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: tinyBoard(),
			drinks: [
				{ id: "d1", name: "Vodka", amount: "shot", price: 60 },
				{ id: "d2", name: "Beer", amount: "sip", price: 30 },
			],
		});
		s = addPlayer(s, { id: "p1", displayName: "P1" }).state;
		s = addPlayer(s, { id: "p2", displayName: "P2" }).state;
		s = transition(s, { type: "start_game", actorId: "p-host" }).state;
	});

	it("appends an order and broadcasts drink_purchased", () => {
		const r = transition(s, {
			type: "buy_drink",
			actorId: "p1",
			recipientId: "p2",
			drinkId: "d1",
			nowMs: 1_000,
		});
		expect(r.state.drinkOrders).toHaveLength(1);
		const order = r.state.drinkOrders[0];
		expect(order?.buyerId).toBe("p1");
		expect(order?.recipientId).toBe("p2");
		expect(order?.drinkId).toBe("d1");
		const broadcast = r.broadcasts.find((b) => b.type === "drink_purchased");
		expect(broadcast).toBeTruthy();
		// Scores untouched.
		expect(r.state.players.p1?.score).toBe(0);
		expect(r.state.players.p2?.score).toBe(0);
	});

	it("rejects self-buy", () => {
		expect(() =>
			transition(s, {
				type: "buy_drink",
				actorId: "p1",
				recipientId: "p1",
				drinkId: "d1",
				nowMs: 1_000,
			}),
		).toThrow();
	});

	it("rejects unknown drink", () => {
		expect(() =>
			transition(s, {
				type: "buy_drink",
				actorId: "p1",
				recipientId: "p2",
				drinkId: "missing",
				nowMs: 1_000,
			}),
		).toThrow();
	});

	it("allows buying for the host", () => {
		const r = transition(s, {
			type: "buy_drink",
			actorId: "p1",
			recipientId: "p-host",
			drinkId: "d2",
			nowMs: 1_000,
		});
		expect(r.state.drinkOrders).toHaveLength(1);
		expect(r.state.drinkOrders[0]?.recipientId).toBe("p-host");
	});

	it("rejects host as buyer", () => {
		expect(() =>
			transition(s, {
				type: "buy_drink",
				actorId: "p-host",
				recipientId: "p1",
				drinkId: "d1",
				nowMs: 1_000,
			}),
		).toThrow();
	});

	it("starts orders unacknowledged and host can mark drank", () => {
		let cur = transition(s, {
			type: "buy_drink",
			actorId: "p1",
			recipientId: "p-host",
			drinkId: "d1",
			nowMs: 1_000,
		}).state;
		expect(cur.drinkOrders[0]?.acknowledgedAtMs).toBeNull();
		const orderId = cur.drinkOrders[0]?.id ?? "";
		const r2 = transition(cur, {
			type: "acknowledge_drink",
			actorId: "p-host",
			orderId,
		});
		cur = r2.state;
		expect(cur.drinkOrders[0]?.acknowledgedAtMs).toBeTypeOf("number");
		expect(
			r2.broadcasts.some(
				(b) => b.type === "drink_acknowledged" && b.orderId === orderId,
			),
		).toBe(true);
	});

	it("rejects acknowledge by non-host", () => {
		const cur = transition(s, {
			type: "buy_drink",
			actorId: "p1",
			recipientId: "p2",
			drinkId: "d1",
			nowMs: 1_000,
		}).state;
		const orderId = cur.drinkOrders[0]?.id ?? "";
		expect(() =>
			transition(cur, {
				type: "acknowledge_drink",
				actorId: "p1",
				orderId,
			}),
		).toThrow();
	});

	it("rejects in lobby phase", () => {
		const lobby = newGame({
			roomCode: "DRINKL",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: tinyBoard(),
			drinks: [{ id: "d1", name: "Vodka", amount: "shot", price: 60 }],
		});
		const withPlayer = addPlayer(lobby, { id: "p1", displayName: "P1" }).state;
		expect(() =>
			transition(withPlayer, {
				type: "buy_drink",
				actorId: "p1",
				recipientId: "p-host",
				drinkId: "d1",
				nowMs: 1_000,
			}),
		).toThrow();
	});
});

describe("Daily Double", () => {
	function ddBoard(): InternalBoard {
		const tiny = tinyBoard();
		tiny.questions.q1!.isDailyDouble = true;
		return tiny;
	}

	let ddState: GameState;
	beforeEach(() => {
		ddState = newGame({
			roomCode: "DDDDDD",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: ddBoard(),
			options: { readDelayMs: 1000 },
		});
		ddState = addPlayer(ddState, { id: "p1", displayName: "P1" }).state;
		ddState = addPlayer(ddState, { id: "p2", displayName: "P2" }).state;
		ddState = transition(ddState, {
			type: "start_game",
			actorId: "p-host",
		}).state;
	});

	it("selecting a DD goes to dd_wagering and broadcasts daily_double_pending with bounds", () => {
		// Default picker is host; rotate to p1 via set_picker so a real player picks.
		ddState = transition(ddState, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		const r = transition(ddState, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q1",
		});
		expect(r.state.phase).toBe("dd_wagering");
		expect(r.state.currentPlayerId).toBe("p1");
		const dd = r.broadcasts.find((b) => b.type === "daily_double_pending");
		expect(dd).toBeTruthy();
		if (dd?.type === "daily_double_pending") {
			expect(dd.min).toBe(100);
			expect(dd.max).toBe(500);
		}
	});

	it("only the picker may wager; other players are rejected", () => {
		ddState = transition(ddState, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		ddState = transition(ddState, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q1",
		}).state;
		expect(() =>
			transition(ddState, { type: "wager", actorId: "p2", amount: 100 }),
		).toThrow(GameError);
	});

	it("rejects wagers outside [min, max]", () => {
		ddState = transition(ddState, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		ddState = transition(ddState, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q1",
		}).state;
		const { min, max } = ddWagerBounds(ddState, "p1");
		expect(() =>
			transition(ddState, { type: "wager", actorId: "p1", amount: min - 1 }),
		).toThrow(GameError);
		expect(() =>
			transition(ddState, { type: "wager", actorId: "p1", amount: max + 1 }),
		).toThrow(GameError);
		expect(() =>
			transition(ddState, { type: "wager", actorId: "p1", amount: 50.5 }),
		).toThrow(GameError);
	});

	it("valid wager → buzzed phase + clue_revealed; correct → +wager, picker rotates, closes", () => {
		ddState = transition(ddState, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		ddState = transition(ddState, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q1",
		}).state;
		const wagerR = transition(ddState, {
			type: "wager",
			actorId: "p1",
			amount: 100,
		});
		expect(wagerR.state.phase).toBe("buzzed");
		expect(wagerR.state.currentWager).toBe(100);
		expect(wagerR.broadcasts.some((b) => b.type === "clue_revealed")).toBe(
			true,
		);

		const judgedR = transition(wagerR.state, {
			type: "judge",
			actorId: "p-host",
			verdict: "correct",
		});
		expect(judgedR.state.players.p1?.score).toBe(100);
		expect(judgedR.state.closedQuestions.has("q1")).toBe(true);
		expect(judgedR.state.phase).toBe("picking");
		expect(judgedR.state.currentPickerId).toBe("p1");
		expect(judgedR.state.currentWager).toBeNull();
	});

	it("DD no_answer is treated as incorrect (subtracts wager) and closes", () => {
		ddState = transition(ddState, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		ddState = transition(ddState, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q1",
		}).state;
		ddState = transition(ddState, {
			type: "wager",
			actorId: "p1",
			amount: 100,
		}).state;
		const r = transition(ddState, {
			type: "judge",
			actorId: "p-host",
			verdict: "no_answer",
		});
		expect(r.state.players.p1?.score).toBe(-100);
		expect(r.state.closedQuestions.has("q1")).toBe(true);
	});

	it("other players cannot buzz on a DD (they are locked out from select)", () => {
		ddState = transition(ddState, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		ddState = transition(ddState, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q1",
		}).state;
		ddState = transition(ddState, {
			type: "wager",
			actorId: "p1",
			amount: 100,
		}).state;
		// p2 cannot buzz; phase is 'buzzed' already (not buzz_open) so any buzz is invalid.
		expect(() =>
			transition(ddState, { type: "buzz", actorId: "p2", nowMs: 0 }),
		).toThrow(GameError);
	});
});

describe("completion", () => {
	it("closing the last question transitions to completed and broadcasts game_completed", () => {
		state = addPlayer(state, { id: "p1", displayName: "P1" }).state;
		state = transition(state, { type: "start_game", actorId: "p-host" }).state;

		// Close q1
		state = transition(state, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q1",
		}).state;
		state = transition(state, {
			type: "open_question",
			actorId: "p-host",
			nowMs: 0,
		}).state;
		state = tickReadDelay(state, state.options.readDelayMs).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 100,
		}).state;
		state = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "no_answer",
		}).state;

		// Close q2
		state = transition(state, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q2",
		}).state;
		state = transition(state, {
			type: "open_question",
			actorId: "p-host",
			nowMs: 1000,
		}).state;
		state = tickReadDelay(state, 1000 + state.options.readDelayMs).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 5000,
		}).state;
		const r = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "no_answer",
		});

		expect(r.state.phase).toBe("completed");
		expect(r.broadcasts.some((b) => b.type === "game_completed")).toBe(true);
	});
});

describe("Final Jeopardy", () => {
	function fjSetup(): GameState {
		let s = newGame({
			roomCode: "FJFJFJ",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: tinyBoard(),
			finalQuestion: { category: "FJ Cat", clue: "fj clue", answer: "fj ans" },
			options: { readDelayMs: 1000, finalEnabled: true },
		});
		s = addPlayer(s, { id: "p1", displayName: "P1" }).state;
		s = addPlayer(s, { id: "p2", displayName: "P2" }).state;
		s = transition(s, { type: "start_game", actorId: "p-host" }).state;
		// q1: p1 answers correct → +100, picker rotates to p1.
		s = transition(s, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q1",
		}).state;
		s = transition(s, {
			type: "open_question",
			actorId: "p-host",
			nowMs: 0,
		}).state;
		s = tickReadDelay(s, s.options.readDelayMs).state;
		s = transition(s, { type: "buzz", actorId: "p1", nowMs: 100 }).state;
		s = transition(s, {
			type: "judge",
			actorId: "p-host",
			verdict: "correct",
		}).state;
		// q2: pick + close (no buzz).
		s = transition(s, {
			type: "select_question",
			actorId: "p1",
			questionRef: "q2",
		}).state;
		s = transition(s, { type: "close_question", actorId: "p-host" }).state;
		return s;
	}

	it("after all main questions, start_final → fj_wager; fj_started lists only eligible (score > 0)", () => {
		const s = fjSetup();
		expect(s.phase).toBe("picking");
		expect(s.players.p1?.score).toBe(100);
		expect(s.players.p2?.score).toBe(0);
		const r = transition(s, { type: "start_final", actorId: "p-host" });
		expect(r.state.phase).toBe("fj_wager");
		const started = r.broadcasts.find((b) => b.type === "fj_started");
		expect(started).toBeTruthy();
		if (started?.type === "fj_started") {
			expect(started.eligible).toEqual(["p1"]);
			expect(started.category).toBe("FJ Cat");
		}
	});

	it("without FJ enabled, all questions closed → completed (regression)", () => {
		let s = newGame({
			roomCode: "NOFJOK",
			hostId: "u-host",
			hostPlayer: { id: "p-host", displayName: "Host" },
			board: tinyBoard(),
			// finalEnabled defaults to false; no finalQuestion.
		});
		s = addPlayer(s, { id: "p1", displayName: "P1" }).state;
		s = transition(s, { type: "start_game", actorId: "p-host" }).state;
		s = transition(s, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q1",
		}).state;
		s = transition(s, { type: "close_question", actorId: "p-host" }).state;
		s = transition(s, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q2",
		}).state;
		const r = transition(s, { type: "close_question", actorId: "p-host" });
		expect(r.state.phase).toBe("completed");
		expect(r.broadcasts.some((b) => b.type === "game_completed")).toBe(true);
	});

	it("rejects fj wagers < 0 or > score", () => {
		let s = fjSetup();
		s = transition(s, { type: "start_final", actorId: "p-host" }).state;
		expect(() =>
			transition(s, { type: "fj_wager", actorId: "p1", amount: -1 }),
		).toThrow(GameError);
		expect(() =>
			transition(s, { type: "fj_wager", actorId: "p1", amount: 101 }),
		).toThrow(GameError);
		// Non-integer.
		expect(() =>
			transition(s, { type: "fj_wager", actorId: "p1", amount: 50.5 }),
		).toThrow(GameError);
		// Ineligible player can't wager.
		expect(() =>
			transition(s, { type: "fj_wager", actorId: "p2", amount: 0 }),
		).toThrow(GameError);
	});

	it("all wagers in → fj_clue_revealed; all answers in → fj_judging with results", () => {
		let s = fjSetup();
		s = transition(s, { type: "start_final", actorId: "p-host" }).state;
		const wagerR = transition(s, {
			type: "fj_wager",
			actorId: "p1",
			amount: 50,
		});
		expect(wagerR.state.phase).toBe("fj_answer");
		expect(wagerR.broadcasts.some((b) => b.type === "fj_clue_revealed")).toBe(
			true,
		);
		expect(wagerR.state.fjClueRevealed).toBe(true);

		const ansR = transition(wagerR.state, {
			type: "fj_answer",
			actorId: "p1",
			text: "guess",
		});
		expect(ansR.state.phase).toBe("fj_judging");
		const judging = ansR.broadcasts.find((b) => b.type === "fj_judging");
		expect(judging).toBeTruthy();
		if (judging?.type === "fj_judging") {
			expect(judging.results).toEqual([
				{ playerId: "p1", wager: 50, answer: "guess" },
			]);
		}
	});

	it("fj_judge per player; last verdict → completed + fj_done + game_completed", () => {
		let s = fjSetup();
		s = transition(s, { type: "start_final", actorId: "p-host" }).state;
		s = transition(s, { type: "fj_wager", actorId: "p1", amount: 50 }).state;
		s = transition(s, {
			type: "fj_answer",
			actorId: "p1",
			text: "guess",
		}).state;
		expect(s.phase).toBe("fj_judging");
		const r = transition(s, {
			type: "fj_judge",
			actorId: "p-host",
			playerId: "p1",
			verdict: "correct",
		});
		expect(r.state.phase).toBe("completed");
		expect(r.state.players.p1?.score).toBe(150);
		expect(r.broadcasts.some((b) => b.type === "fj_done")).toBe(true);
		expect(r.broadcasts.some((b) => b.type === "game_completed")).toBe(true);
		expect(
			r.broadcasts.some(
				(b) =>
					b.type === "fj_judged" && b.playerId === "p1" && b.scoreDelta === 50,
			),
		).toBe(true);
	});
});

describe("lobby join rules", () => {
	it("can join during lobby and picking, but not during reading", () => {
		const r1 = addPlayer(state, { id: "p1", displayName: "P1" });
		expect(r1.state.players.p1?.status).toBe("joined");
		expect(r1.broadcasts[0]?.type).toBe("player_joined");

		const started = transition(r1.state, {
			type: "start_game",
			actorId: "p-host",
		}).state;
		const r2 = addPlayer(started, { id: "p2", displayName: "P2" });
		expect(r2.state.players.p2).toBeTruthy();

		const opened = transition(r2.state, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q1",
		}).state;
		const reading = transition(opened, {
			type: "open_question",
			actorId: "p-host",
			nowMs: 0,
		}).state;
		expect(() => addPlayer(reading, { id: "p3", displayName: "P3" })).toThrow(
			GameError,
		);
	});

	it("joining the same player twice is a no-op", () => {
		const r1 = addPlayer(state, { id: "p1", displayName: "P1" });
		const r2 = addPlayer(r1.state, { id: "p1", displayName: "P1" });
		expect(Object.keys(r2.state.players)).toHaveLength(2); // host + p1
		expect(r2.broadcasts).toHaveLength(0);
	});
});

describe("buzz queue", () => {
	// Set up: host + 3 players, game started, q1 open and buzz window open.
	beforeEach(() => {
		state = addPlayer(state, { id: "p1", displayName: "P1" }).state;
		state = addPlayer(state, { id: "p2", displayName: "P2" }).state;
		state = addPlayer(state, { id: "p3", displayName: "P3" }).state;
		state = transition(state, { type: "start_game", actorId: "p-host" }).state;
		state = transition(state, {
			type: "set_picker",
			actorId: "p-host",
			playerId: "p1",
		}).state;
		state = transition(state, {
			type: "select_question",
			actorId: "p-host",
			questionRef: "q1",
		}).state;
		state = transition(state, {
			type: "open_question",
			actorId: "p-host",
			nowMs: 1000,
		}).state;
		state = tickReadDelay(state, 2000).state; // buzz_open
		// p1 buzzes first
		state = transition(state, {
			type: "buzz",
			actorId: "p1",
			nowMs: 2050,
		}).state;
		// p2 and p3 join the queue
		state = transition(state, {
			type: "buzz",
			actorId: "p2",
			nowMs: 2060,
		}).state;
		state = transition(state, {
			type: "buzz",
			actorId: "p3",
			nowMs: 2070,
		}).state;
	});

	it("queue preserves arrival order", () => {
		expect(state.buzzQueue).toEqual(["p2", "p3"]);
		expect(state.currentPlayerId).toBe("p1");
	});

	it("same player cannot enter queue twice", () => {
		const r = transition(state, { type: "buzz", actorId: "p2", nowMs: 2080 });
		expect(r.state.buzzQueue).toEqual(["p2", "p3"]); // unchanged
	});

	it("current answerer buzzing again is a no-op", () => {
		// p1 holds the floor; re-buzzing is silently ignored
		const r = transition(state, { type: "buzz", actorId: "p1", nowMs: 2080 });
		expect(r.state.buzzQueue).toEqual(["p2", "p3"]);
		expect(r.broadcasts).toHaveLength(0);
	});

	it("locked-out player cannot enter queue", () => {
		// force p1 to be locked out by judging them incorrect first
		let s = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "incorrect",
		}).state;
		// s is now buzz_open with p1 locked out; p2 buzzes to become answerer
		s = transition(s, { type: "buzz", actorId: "p2", nowMs: 3000 }).state;
		// p3 joins queue
		s = transition(s, { type: "buzz", actorId: "p3", nowMs: 3010 }).state;
		// p1 is locked out — should throw
		expect(() =>
			transition(s, { type: "buzz", actorId: "p1", nowMs: 3020 }),
		).toThrow(GameError);
	});

	it("next_player pops queue, sets new currentPlayerId, broadcasts both buzzed and queue_updated", () => {
		const r = transition(state, { type: "next_player", actorId: "p-host" });
		expect(r.state.currentPlayerId).toBe("p2");
		expect(r.state.buzzQueue).toEqual(["p3"]);
		expect(r.state.lockedOutOnCurrent.has("p1")).toBe(true);
		expect(
			r.broadcasts.some((b) => b.type === "buzzed" && b.playerId === "p2"),
		).toBe(true);
		expect(
			r.broadcasts.some(
				(b) => b.type === "buzz_queue_updated" && b.queue.length === 1,
			),
		).toBe(true);
	});

	it("next_player on empty queue throws", () => {
		state = transition(state, { type: "next_player", actorId: "p-host" }).state;
		state = transition(state, { type: "next_player", actorId: "p-host" }).state;
		expect(() =>
			transition(state, { type: "next_player", actorId: "p-host" }),
		).toThrow(GameError);
	});

	it("non-host cannot call next_player", () => {
		expect(() =>
			transition(state, { type: "next_player", actorId: "p1" }),
		).toThrow(GameError);
	});

	it("buzzQueue cleared when question closes", () => {
		state = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "correct",
		}).state;
		expect(state.buzzQueue).toEqual([]);
	});

	it("buzzQueue cleared when host closes question manually", () => {
		state = transition(state, {
			type: "close_question",
			actorId: "p-host",
		}).state;
		expect(state.buzzQueue).toEqual([]);
	});

	it("full flow: two players buzz, host judges first incorrect, advances to second", () => {
		// p1 is wrong
		let r = transition(state, {
			type: "judge",
			actorId: "p-host",
			verdict: "incorrect",
		});
		// judge with remaining players goes back to buzz_open and clears the queue
		expect(r.state.phase).toBe("buzz_open");
		expect(r.state.buzzQueue).toEqual([]);
		// p2 buzzes in the new live window
		r = transition(r.state, { type: "buzz", actorId: "p2", nowMs: 3000 });
		expect(r.state.currentPlayerId).toBe("p2");
		expect(r.state.phase).toBe("buzzed");
	});
});
