import type {
	FinalJeopardyView,
	GameView,
	PlayerView,
	ServerToClient,
} from "server/src/game/protocol.ts";
import { create } from "zustand";

export interface DailyDoublePending {
	pickerId: string;
	categoryRef: string;
	min: number;
	max: number;
}

export interface GameStoreState {
	game: GameView | null;
	selfPlayerId: string | null;
	/** DD wager prompt (set on `daily_double_pending`, cleared on `clue_revealed`). */
	ddPending: DailyDoublePending | null;
	/** Player ids eligible to play Final Jeopardy (set on fj_started). */
	fjEligible: string[];
	/** Latest one-off error pushed by the server (e.g. early_buzz). */
	lastError: { code: string; message: string } | null;
	/** Apply a server→client message; mutates the store. */
	apply: (msg: ServerToClient) => void;
	reset: () => void;
}

function emptyFinal(category: string): FinalJeopardyView {
	return {
		category,
		clue: null,
		answer: null,
		wagersSubmitted: [],
		answersSubmitted: [],
		results: [],
	};
}

export const createGameStore = () =>
	create<GameStoreState>((set, get) => ({
		game: null,
		selfPlayerId: null,
		ddPending: null,
		fjEligible: [],
		lastError: null,

		apply(msg) {
			switch (msg.type) {
				case "snapshot":
					set({
						game: msg.game,
						selfPlayerId: msg.you.playerId,
						ddPending: null,
						fjEligible: msg.game.finalJeopardy
							? msg.game.finalJeopardy.results.map((r) => r.playerId)
							: [],
						lastError: null,
					});
					return;
				case "player_joined": {
					const g = get().game;
					if (!g) return;
					const exists = g.players.find((p) => p.id === msg.player.id);
					const players = exists
						? g.players.map((p) => (p.id === msg.player.id ? msg.player : p))
						: [...g.players, msg.player];
					set({ game: { ...g, players } });
					return;
				}
				case "player_left": {
					const g = get().game;
					if (!g) return;
					const players = g.players.map(
						(p): PlayerView =>
							p.id === msg.playerId
								? {
										...p,
										status:
											msg.reason === "kicked"
												? "kicked"
												: msg.reason === "disconnect"
													? "disconnected"
													: "left",
									}
								: p,
					);
					set({ game: { ...g, players } });
					return;
				}
				case "game_started": {
					const g = get().game;
					if (!g) return;
					set({ game: { ...g, phase: "picking" } });
					return;
				}
				case "question_open": {
					const g = get().game;
					if (!g) return;
					set({
						game: {
							...g,
							phase: "reading",
							currentQuestion: msg.question,
							buzzOpensAt: msg.opensBuzzAt,
							currentPlayerId: null,
						},
					});
					return;
				}
				case "buzz_open": {
					const g = get().game;
					if (!g) return;
					set({ game: { ...g, phase: "buzz_open" } });
					return;
				}
				case "buzzed": {
					const g = get().game;
					if (!g) return;
					set({
						game: { ...g, phase: "buzzed", currentPlayerId: msg.playerId },
					});
					return;
				}
				case "judged": {
					const g = get().game;
					if (!g) return;
					const players = g.players.map((p) =>
						p.id === msg.playerId ? { ...p, score: msg.newScore } : p,
					);
					set({ game: { ...g, players } });
					return;
				}
				case "score_adjusted": {
					const g = get().game;
					if (!g) return;
					const players = g.players.map((p) =>
						p.id === msg.playerId ? { ...p, score: msg.newScore } : p,
					);
					set({ game: { ...g, players } });
					return;
				}
				case "question_closed": {
					const g = get().game;
					if (!g) return;
					const board = g.board.map((c) => ({
						...c,
						questions: c.questions.map((q) =>
							q.ref === msg.questionRef ? { ...q, closed: true } : q,
						),
					}));
					set({
						game: {
							...g,
							board,
							phase: g.phase === "completed" ? "completed" : "picking",
							currentQuestion: null,
							currentPlayerId: null,
							buzzOpensAt: null,
							currentWager: null,
						},
						ddPending: null,
					});
					return;
				}
				case "picker_changed": {
					const g = get().game;
					if (!g) return;
					set({ game: { ...g, currentPickerId: msg.playerId } });
					return;
				}
				case "daily_double_pending": {
					const g = get().game;
					if (!g) return;
					set({
						game: { ...g, phase: "dd_wagering", currentPlayerId: msg.pickerId },
						ddPending: {
							pickerId: msg.pickerId,
							categoryRef: msg.categoryRef,
							min: msg.min,
							max: msg.max,
						},
					});
					return;
				}
				case "clue_revealed": {
					const g = get().game;
					if (!g) return;
					set({
						game: {
							...g,
							phase: "buzzed",
							currentQuestion: msg.question,
							currentPlayerId: msg.pickerId,
							currentWager: msg.wager,
						},
						ddPending: null,
					});
					return;
				}
				case "fj_started": {
					const g = get().game;
					if (!g) return;
					set({
						game: {
							...g,
							phase: "fj_wager",
							currentPickerId: null,
							currentQuestion: null,
							currentPlayerId: null,
							currentWager: null,
							finalJeopardy: emptyFinal(msg.category),
						},
						fjEligible: msg.eligible,
						ddPending: null,
					});
					return;
				}
				case "fj_wager_submitted": {
					const g = get().game;
					if (!g?.finalJeopardy) return;
					const fj = g.finalJeopardy;
					if (fj.wagersSubmitted.includes(msg.playerId)) return;
					set({
						game: {
							...g,
							finalJeopardy: {
								...fj,
								wagersSubmitted: [...fj.wagersSubmitted, msg.playerId],
							},
						},
					});
					return;
				}
				case "fj_clue_revealed": {
					const g = get().game;
					if (!g?.finalJeopardy) return;
					set({
						game: {
							...g,
							phase: "fj_answer",
							finalJeopardy: { ...g.finalJeopardy, clue: msg.clue },
						},
					});
					return;
				}
				case "fj_answer_submitted": {
					const g = get().game;
					if (!g?.finalJeopardy) return;
					const fj = g.finalJeopardy;
					if (fj.answersSubmitted.includes(msg.playerId)) return;
					set({
						game: {
							...g,
							finalJeopardy: {
								...fj,
								answersSubmitted: [...fj.answersSubmitted, msg.playerId],
							},
						},
					});
					return;
				}
				case "fj_judging": {
					const g = get().game;
					if (!g?.finalJeopardy) return;
					set({
						game: {
							...g,
							phase: "fj_judging",
							finalJeopardy: {
								...g.finalJeopardy,
								results: msg.results.map((r) => ({ ...r, verdict: null })),
							},
						},
					});
					return;
				}
				case "fj_judged": {
					const g = get().game;
					if (!g?.finalJeopardy) return;
					const players = g.players.map((p) =>
						p.id === msg.playerId ? { ...p, score: msg.newScore } : p,
					);
					const results = g.finalJeopardy.results.map((r) =>
						r.playerId === msg.playerId ? { ...r, verdict: msg.verdict } : r,
					);
					set({
						game: {
							...g,
							players,
							finalJeopardy: { ...g.finalJeopardy, results },
						},
					});
					return;
				}
				case "fj_done": {
					// no-op; game_completed follows
					return;
				}
				case "game_completed": {
					const g = get().game;
					if (!g) return;
					set({ game: { ...g, phase: "completed" } });
					return;
				}
				case "settings_updated": {
					const g = get().game;
					if (!g) return;
					set({ game: { ...g, ...msg.settings } });
					return;
				}
				case "error":
					set({ lastError: { code: msg.code, message: msg.message } });
					return;
				case "pong":
					return;
			}
		},

		reset() {
			set({
				game: null,
				selfPlayerId: null,
				ddPending: null,
				fjEligible: [],
				lastError: null,
			});
		},
	}));
