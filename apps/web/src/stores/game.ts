import type {
	GameView,
	PlayerView,
	ServerToClient,
} from "server/src/game/protocol.ts";
import { create } from "zustand";

export interface GameStoreState {
	game: GameView | null;
	selfPlayerId: string | null;
	/** Latest one-off error pushed by the server (e.g. early_buzz). */
	lastError: { code: string; message: string } | null;
	/** Apply a server→client message; mutates the store. */
	apply: (msg: ServerToClient) => void;
	reset: () => void;
}

export const createGameStore = () =>
	create<GameStoreState>((set, get) => ({
		game: null,
		selfPlayerId: null,
		lastError: null,

		apply(msg) {
			switch (msg.type) {
				case "snapshot":
					set({
						game: msg.game,
						selfPlayerId: msg.you.playerId,
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
						},
					});
					return;
				}
				case "game_completed": {
					const g = get().game;
					if (!g) return;
					set({ game: { ...g, phase: "completed" } });
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
			set({ game: null, selfPlayerId: null, lastError: null });
		},
	}));
