import type {
	FinalJeopardyView,
	GameView,
	Phase,
	PlayerView,
	ServerToClient,
} from "./protocol.ts";

// Read delay between question_open and buzz_open. Defaults match SRS
// FR-MG2 (3000ms). Per-game overrides land in slice 04.
export const DEFAULT_READ_DELAY_MS = 3000;
/** Early-buzz lockout (FR-MG3). 500ms during which an early buzzer can't try again on this question. */
export const EARLY_BUZZ_LOCKOUT_MS = 500;

export interface GameOptions {
	readDelayMs: number;
	finalEnabled: boolean;
}

export interface InternalFinalQuestion {
	category: string;
	clue: string;
	answer: string;
}

export interface InternalQuestion {
	ref: string;
	categoryRef: string;
	position: number;
	pointValue: number;
	isDailyDouble: boolean;
	clue: string;
	answer: string;
}

export interface InternalBoard {
	categories: {
		ref: string;
		position: number;
		title: string;
		questionRefs: string[];
	}[];
	questions: Record<string, InternalQuestion>;
}

export interface InternalPlayer {
	id: string;
	displayName: string;
	score: number;
	status: "joined" | "left" | "kicked" | "disconnected";
	isHost: boolean;
}

export interface GameState {
	roomCode: string;
	hostId: string;
	options: GameOptions;
	phase: Phase;
	players: Record<string, InternalPlayer>;
	board: InternalBoard;
	closedQuestions: Set<string>;
	/** id of the question currently selected/open. */
	currentQuestionRef: string | null;
	/** When the buzz window opens, ms since epoch. */
	buzzOpensAtMs: number | null;
	/** Player who has buzzed in successfully. */
	currentPlayerId: string | null;
	/** Players locked out of buzzing on the current question. */
	lockedOutOnCurrent: Set<string>;
	/**
	 * The player whose turn it is to pick a question. Null in lobby.
	 * Defaults to the host on game start; rotates to the most recent
	 * correct answerer; the host may override via `set_picker`.
	 */
	currentPickerId: string | null;
	/** For Daily Double / Final Jeopardy: amount on the line. */
	currentWager: number | null;
	/** Final Jeopardy data. Null if disabled or quiz has none. */
	finalQuestion: InternalFinalQuestion | null;
	/** Per-player FJ wager (private until judging). */
	fjWagers: Record<string, number>;
	/** Per-player FJ answer (private until judging). */
	fjAnswers: Record<string, string>;
	/** Per-player FJ verdict, set as host judges. */
	fjJudged: Record<string, "correct" | "incorrect" | "no_answer">;
	/** True once host clicked Reveal Clue (i.e. all wagers are in or skipped). */
	fjClueRevealed: boolean;
}

// ───── Result + error helpers ─────

export interface TransitionResult {
	state: GameState;
	/** Messages to broadcast to all sockets in the room. */
	broadcasts: ServerToClient[];
}

export class GameError extends Error {
	constructor(
		public code: string,
		message: string,
	) {
		super(message);
	}
}

function ok(
	state: GameState,
	broadcasts: ServerToClient[] = [],
): TransitionResult {
	return { state, broadcasts };
}

// ───── Factories ─────

export function newGame(args: {
	roomCode: string;
	hostId: string;
	hostPlayer: { id: string; displayName: string };
	board: InternalBoard;
	finalQuestion?: InternalFinalQuestion | null;
	options?: Partial<GameOptions>;
}): GameState {
	return {
		roomCode: args.roomCode,
		hostId: args.hostId,
		options: {
			readDelayMs: args.options?.readDelayMs ?? DEFAULT_READ_DELAY_MS,
			finalEnabled: args.options?.finalEnabled ?? false,
		},
		phase: "lobby",
		players: {
			[args.hostPlayer.id]: {
				id: args.hostPlayer.id,
				displayName: args.hostPlayer.displayName,
				score: 0,
				status: "joined",
				isHost: true,
			},
		},
		board: args.board,
		closedQuestions: new Set(),
		currentQuestionRef: null,
		buzzOpensAtMs: null,
		currentPlayerId: null,
		lockedOutOnCurrent: new Set(),
		currentPickerId: null,
		currentWager: null,
		finalQuestion: args.finalQuestion ?? null,
		fjWagers: {},
		fjAnswers: {},
		fjJudged: {},
		fjClueRevealed: false,
	};
}

/** Players eligible to play Final Jeopardy: non-host, joined, score > 0. */
export function fjEligiblePlayers(state: GameState): InternalPlayer[] {
	return Object.values(state.players).filter(
		(p) => !p.isHost && p.status === "joined" && p.score > 0,
	);
}

/**
 * Are we ready to enter Final Jeopardy from the picking phase? True when
 * every main board question is closed, FJ is enabled + present, and at
 * least one player is eligible.
 */
function fjAvailable(state: GameState, closed: Set<string>): boolean {
	const allClosed = Object.values(state.board.questions).length === closed.size;
	if (!allClosed) return false;
	if (!state.finalQuestion || !state.options.finalEnabled) return false;
	return fjEligiblePlayers(state).length > 0;
}

/** Min and max wager bounds for a Daily Double picked by `playerId`. */
export function ddWagerBounds(
	state: GameState,
	playerId: string,
): { min: number; max: number } {
	const p = state.players[playerId];
	const remaining = Object.values(state.board.questions)
		.filter((q) => !state.closedQuestions.has(q.ref))
		.map((q) => q.pointValue);
	const maxRemaining = remaining.length > 0 ? Math.max(...remaining) : 5;
	const max = Math.max(5, maxRemaining, p?.score ?? 0);
	return { min: 5, max };
}

// ───── View projection (state → wire view) ─────

export function projectView(state: GameState): GameView {
	return {
		roomCode: state.roomCode,
		hostId: state.hostId,
		phase: state.phase,
		players: Object.values(state.players)
			.sort((a, b) =>
				a.isHost === b.isHost
					? a.displayName.localeCompare(b.displayName)
					: a.isHost
						? -1
						: 1,
			)
			.map<PlayerView>((p) => ({
				id: p.id,
				displayName: p.displayName,
				score: p.score,
				status: p.status,
				isHost: p.isHost,
			})),
		board: state.board.categories.map((c) => ({
			ref: c.ref,
			position: c.position,
			title: c.title,
			questions: c.questionRefs.map((qref) => {
				const q = state.board.questions[qref];
				if (!q) throw new Error(`Bad board: missing question ${qref}`);
				return {
					ref: q.ref,
					position: q.position,
					pointValue: q.pointValue,
					closed: state.closedQuestions.has(q.ref),
				};
			}),
		})),
		currentQuestion: state.currentQuestionRef
			? (() => {
					const q = state.board.questions[state.currentQuestionRef];
					if (!q) return null;
					return q;
				})()
			: null,
		buzzOpensAt: state.buzzOpensAtMs
			? new Date(state.buzzOpensAtMs).toISOString()
			: null,
		currentPlayerId: state.currentPlayerId,
		currentPickerId: state.currentPickerId,
		finalJeopardy: projectFinal(state),
	};
}

function projectFinal(state: GameState): FinalJeopardyView | null {
	if (!state.finalQuestion) return null;
	// Until FJ is in flight, we still expose the category so the snapshot
	// has consistent shape; the host uses this to know "FJ exists".
	return {
		category: state.finalQuestion.category,
		clue: state.fjClueRevealed ? state.finalQuestion.clue : null,
		answer:
			state.phase === "fj_judging" || state.phase === "completed"
				? state.finalQuestion.answer
				: null,
		wagersSubmitted: Object.keys(state.fjWagers),
		answersSubmitted: Object.keys(state.fjAnswers),
		results:
			state.phase === "fj_judging" || state.phase === "completed"
				? Object.entries(state.fjJudged).map(([playerId, verdict]) => ({
						playerId,
						wager: state.fjWagers[playerId] ?? 0,
						answer: state.fjAnswers[playerId] ?? "",
						verdict,
					}))
				: [],
	};
}

// ───── Mutators ─────

export function addPlayer(
	state: GameState,
	player: { id: string; displayName: string },
): TransitionResult {
	if (state.players[player.id]) return ok(state);
	if (state.phase !== "lobby" && state.phase !== "picking") {
		throw new GameError(
			"cannot_join",
			"Cannot join after the game has started a question",
		);
	}
	const newPlayer: InternalPlayer = {
		id: player.id,
		displayName: player.displayName,
		score: 0,
		status: "joined",
		isHost: false,
	};
	const next: GameState = {
		...state,
		players: { ...state.players, [player.id]: newPlayer },
	};
	return ok(next, [{ type: "player_joined", player: newPlayer }]);
}

export function setPlayerStatus(
	state: GameState,
	playerId: string,
	status: "joined" | "disconnected" | "left" | "kicked",
): TransitionResult {
	const p = state.players[playerId];
	if (!p) throw new GameError("unknown_player", "Player not in game");
	const next: GameState = {
		...state,
		players: { ...state.players, [playerId]: { ...p, status } },
	};
	if (status === "left" || status === "kicked" || status === "disconnected") {
		return ok(next, [
			{
				type: "player_left",
				playerId,
				reason:
					status === "disconnected"
						? "disconnect"
						: status === "kicked"
							? "kicked"
							: "leave",
			},
		]);
	}
	return ok(next);
}

// ───── Transition ─────

export type Intent =
	| { type: "start_game"; actorId: string }
	| { type: "select_question"; actorId: string; questionRef: string }
	| { type: "open_question"; actorId: string; nowMs: number }
	| { type: "buzz"; actorId: string; nowMs: number }
	| {
			type: "judge";
			actorId: string;
			verdict: "correct" | "incorrect" | "no_answer";
	  }
	| { type: "close_question"; actorId: string }
	| { type: "set_picker"; actorId: string; playerId: string }
	| { type: "wager"; actorId: string; amount: number }
	| { type: "start_final"; actorId: string }
	| { type: "fj_wager"; actorId: string; amount: number }
	| { type: "fj_answer"; actorId: string; text: string }
	| {
			type: "fj_judge";
			actorId: string;
			playerId: string;
			verdict: "correct" | "incorrect" | "no_answer";
	  };

function requireHost(state: GameState, actorId: string) {
	const p = state.players[actorId];
	if (!p?.isHost) throw new GameError("forbidden", "Host only");
}

function requirePlayer(state: GameState, actorId: string) {
	const p = state.players[actorId];
	if (!p) throw new GameError("unknown_player", "Not a player in this game");
	return p;
}

export function transition(state: GameState, intent: Intent): TransitionResult {
	switch (intent.type) {
		case "start_game": {
			requireHost(state, intent.actorId);
			if (state.phase !== "lobby")
				throw new GameError("invalid_state", "Already started");
			const playerCount = Object.values(state.players).filter(
				(p) => !p.isHost,
			).length;
			if (playerCount < 1)
				throw new GameError("not_enough_players", "Need ≥ 1 non-host player");
			// Host is the first picker; rotates on correct answers (FR-MG handled in `judge`).
			const next: GameState = {
				...state,
				phase: "picking",
				currentPickerId: intent.actorId,
			};
			return ok(next, [
				{ type: "game_started" },
				{ type: "picker_changed", playerId: intent.actorId },
			]);
		}

		case "select_question": {
			// Either the host or the current picker may select.
			const actor = state.players[intent.actorId];
			if (
				!actor ||
				(!actor.isHost && intent.actorId !== state.currentPickerId)
			) {
				throw new GameError(
					"forbidden",
					"Only the host or current picker may select",
				);
			}
			if (state.phase !== "picking")
				throw new GameError("invalid_state", "Not picking");
			if (state.closedQuestions.has(intent.questionRef))
				throw new GameError("invalid_state", "Question already closed");
			const q = state.board.questions[intent.questionRef];
			if (!q) throw new GameError("not_found", "Unknown question");

			// Daily Double: skip the buzz cycle. Only the picker plays.
			if (q.isDailyDouble) {
				const pickerId = state.currentPickerId;
				if (!pickerId) throw new GameError("invalid_state", "No picker set");
				const picker = state.players[pickerId];
				if (!picker || picker.isHost)
					throw new GameError(
						"invalid_state",
						"Host cannot play a Daily Double",
					);
				const lockedOut = new Set(
					Object.values(state.players)
						.filter((p) => !p.isHost && p.id !== pickerId)
						.map((p) => p.id),
				);
				const next: GameState = {
					...state,
					currentQuestionRef: intent.questionRef,
					phase: "dd_wagering",
					currentPlayerId: pickerId,
					lockedOutOnCurrent: lockedOut,
					currentWager: null,
				};
				const { min, max } = ddWagerBounds(next, pickerId);
				return ok(next, [
					{
						type: "daily_double_pending",
						pickerId,
						categoryRef: q.categoryRef,
						min,
						max,
					},
				]);
			}

			const next: GameState = {
				...state,
				currentQuestionRef: intent.questionRef,
				currentPlayerId: null,
				lockedOutOnCurrent: new Set(),
				currentWager: null,
			};
			// No broadcast — the open_question step is what reveals the clue.
			return ok(next);
		}

		case "open_question": {
			requireHost(state, intent.actorId);
			if (state.phase !== "picking")
				throw new GameError("invalid_state", "Not picking");
			if (!state.currentQuestionRef)
				throw new GameError("invalid_state", "No question selected");
			const q = state.board.questions[state.currentQuestionRef];
			if (!q) throw new GameError("not_found", "Unknown question");
			const buzzOpensAtMs = intent.nowMs + state.options.readDelayMs;
			const next: GameState = {
				...state,
				phase: "reading",
				buzzOpensAtMs,
			};
			return ok(next, [
				{
					type: "question_open",
					question: {
						ref: q.ref,
						categoryRef: q.categoryRef,
						pointValue: q.pointValue,
						isDailyDouble: q.isDailyDouble,
						clue: q.clue,
						answer: q.answer,
					},
					opensBuzzAt: new Date(buzzOpensAtMs).toISOString(),
				},
			]);
		}

		case "buzz": {
			const player = requirePlayer(state, intent.actorId);
			if (player.isHost) throw new GameError("forbidden", "Host cannot buzz");
			if (state.phase === "reading") {
				// Early buzz: lock the player out, do not transition. (FR-MG3)
				if (state.lockedOutOnCurrent.has(player.id)) return ok(state); // already locked
				const next: GameState = {
					...state,
					lockedOutOnCurrent: new Set([...state.lockedOutOnCurrent, player.id]),
				};
				return ok(next, [
					{
						type: "error",
						code: "early_buzz",
						message: "Buzzed too early — locked out",
					},
				]);
			}
			if (state.phase !== "buzz_open")
				throw new GameError("invalid_state", "Not buzzing");
			if (state.lockedOutOnCurrent.has(player.id))
				throw new GameError("locked_out", "Locked out on this question");
			const next: GameState = {
				...state,
				phase: "buzzed",
				currentPlayerId: player.id,
			};
			return ok(next, [{ type: "buzzed", playerId: player.id }]);
		}

		case "judge": {
			requireHost(state, intent.actorId);
			if (
				state.phase !== "buzzed" ||
				!state.currentPlayerId ||
				!state.currentQuestionRef
			)
				throw new GameError("invalid_state", "No buzzed player to judge");
			const q = state.board.questions[state.currentQuestionRef];
			if (!q) throw new GameError("not_found", "Unknown question");
			const p = state.players[state.currentPlayerId];
			if (!p) throw new GameError("not_found", "Unknown player");

			// DD: the wager is at stake, no_answer treated as incorrect (sub-plan decision).
			const wager = state.currentWager;
			const isDD = wager !== null;
			const stake = isDD ? wager : q.pointValue;
			const delta =
				intent.verdict === "correct"
					? stake
					: intent.verdict === "incorrect" ||
							(isDD && intent.verdict === "no_answer")
						? -stake
						: 0;

			const nextScore = p.score + delta;
			const nextPlayers = {
				...state.players,
				[p.id]: { ...p, score: nextScore },
			};

			// Eligibility: any non-host, joined player not already locked out.
			// For re-buzz we add the buzzed player to the locked set.
			const nextLockedOut = new Set([...state.lockedOutOnCurrent, p.id]);
			const eligible = Object.values(nextPlayers).filter(
				(pl) =>
					!pl.isHost && pl.status === "joined" && !nextLockedOut.has(pl.id),
			);

			const broadcasts: ServerToClient[] = [
				{
					type: "judged",
					playerId: p.id,
					verdict: intent.verdict,
					scoreDelta: delta,
					newScore: nextScore,
				},
			];

			// Correct → close question, rotate picker. (FR-MG7)
			// Incorrect/no_answer with eligible players left → re-buzz.
			// Incorrect/no_answer with nobody left → close. (FR-MG7)
			// Daily Double: always closes regardless of verdict (no re-buzz).
			const shouldClose =
				isDD || intent.verdict === "correct" || eligible.length === 0;

			if (shouldClose) {
				const nextClosed = new Set([...state.closedQuestions, q.ref]);
				const allClosed =
					Object.values(state.board.questions).length === nextClosed.size;
				const fjPending = fjAvailable(
					{ ...state, players: nextPlayers },
					nextClosed,
				);
				const nextPicker =
					intent.verdict === "correct" ? p.id : state.currentPickerId;
				const next: GameState = {
					...state,
					players: nextPlayers,
					closedQuestions: nextClosed,
					phase: allClosed && !fjPending ? "completed" : "picking",
					currentQuestionRef: null,
					currentPlayerId: null,
					buzzOpensAtMs: null,
					lockedOutOnCurrent: new Set(),
					currentPickerId: allClosed ? null : nextPicker,
					currentWager: null,
				};
				broadcasts.push({ type: "question_closed", questionRef: q.ref });
				if (
					intent.verdict === "correct" &&
					nextPicker !== state.currentPickerId
				) {
					broadcasts.push({ type: "picker_changed", playerId: nextPicker });
				}
				if (allClosed && !fjPending)
					broadcasts.push({ type: "game_completed" });
				return ok(next, broadcasts);
			}

			// Re-buzz: stay on this question, reopen buzzing.
			const next: GameState = {
				...state,
				players: nextPlayers,
				phase: "buzz_open",
				currentPlayerId: null,
				lockedOutOnCurrent: nextLockedOut,
			};
			broadcasts.push({ type: "buzz_open" });
			return ok(next, broadcasts);
		}

		case "close_question": {
			requireHost(state, intent.actorId);
			if (!state.currentQuestionRef)
				throw new GameError("invalid_state", "No current question");
			const ref = state.currentQuestionRef;
			const nextClosed = new Set([...state.closedQuestions, ref]);
			const allClosed =
				Object.values(state.board.questions).length === nextClosed.size;
			const fjPending = fjAvailable(state, nextClosed);
			const next: GameState = {
				...state,
				phase: allClosed && !fjPending ? "completed" : "picking",
				closedQuestions: nextClosed,
				currentQuestionRef: null,
				currentPlayerId: null,
				buzzOpensAtMs: null,
				lockedOutOnCurrent: new Set(),
				currentPickerId: allClosed ? null : state.currentPickerId,
				currentWager: null,
			};
			const broadcasts: ServerToClient[] = [
				{ type: "question_closed", questionRef: ref },
			];
			if (allClosed && !fjPending) broadcasts.push({ type: "game_completed" });
			return ok(next, broadcasts);
		}

		case "wager": {
			if (
				state.phase !== "dd_wagering" ||
				!state.currentQuestionRef ||
				!state.currentPlayerId
			) {
				throw new GameError("invalid_state", "No wager pending");
			}
			if (intent.actorId !== state.currentPlayerId) {
				throw new GameError(
					"forbidden",
					"Only the picking player may wager on a Daily Double",
				);
			}
			const { min, max } = ddWagerBounds(state, intent.actorId);
			if (
				!Number.isInteger(intent.amount) ||
				intent.amount < min ||
				intent.amount > max
			) {
				throw new GameError(
					"invalid_wager",
					`Wager must be an integer between ${min} and ${max}`,
				);
			}
			const q = state.board.questions[state.currentQuestionRef];
			if (!q) throw new GameError("not_found", "Unknown question");
			const next: GameState = {
				...state,
				phase: "buzzed",
				currentWager: intent.amount,
			};
			return ok(next, [
				{
					type: "clue_revealed",
					question: {
						ref: q.ref,
						categoryRef: q.categoryRef,
						pointValue: q.pointValue,
						isDailyDouble: q.isDailyDouble,
						clue: q.clue,
						answer: q.answer,
					},
					wager: intent.amount,
					pickerId: intent.actorId,
				},
			]);
		}

		case "set_picker": {
			requireHost(state, intent.actorId);
			const target = state.players[intent.playerId];
			if (!target || target.isHost)
				throw new GameError("not_found", "No such player");
			if (state.phase !== "picking")
				throw new GameError(
					"invalid_state",
					"Can only override picker between questions",
				);
			if (state.currentPickerId === intent.playerId) return ok(state);
			const next: GameState = { ...state, currentPickerId: intent.playerId };
			return ok(next, [{ type: "picker_changed", playerId: intent.playerId }]);
		}

		case "start_final": {
			requireHost(state, intent.actorId);
			if (state.phase !== "picking")
				throw new GameError("invalid_state", "Not picking");
			if (!fjAvailable(state, state.closedQuestions)) {
				throw new GameError(
					"invalid_state",
					"Final Jeopardy is not available yet",
				);
			}
			// fjAvailable guarantees finalQuestion is set.
			const finalQ = state.finalQuestion;
			if (!finalQ)
				throw new GameError("invalid_state", "No Final Jeopardy question");
			const eligible = fjEligiblePlayers(state).map((p) => p.id);
			const next: GameState = {
				...state,
				phase: "fj_wager",
				currentPickerId: null,
				currentQuestionRef: null,
				currentPlayerId: null,
				currentWager: null,
				fjWagers: {},
				fjAnswers: {},
				fjJudged: {},
				fjClueRevealed: false,
			};
			return ok(next, [
				{ type: "fj_started", category: finalQ.category, eligible },
			]);
		}

		case "fj_wager": {
			if (state.phase !== "fj_wager")
				throw new GameError("invalid_state", "Not collecting wagers");
			const player = state.players[intent.actorId];
			if (!player || player.isHost)
				throw new GameError("forbidden", "Players only");
			const eligible = fjEligiblePlayers(state).some(
				(p) => p.id === intent.actorId,
			);
			if (!eligible)
				throw new GameError(
					"not_eligible",
					"You are not playing Final Jeopardy",
				);
			if (
				!Number.isInteger(intent.amount) ||
				intent.amount < 0 ||
				intent.amount > player.score
			) {
				throw new GameError(
					"invalid_wager",
					`FJ wager must be an integer in [0, ${player.score}]`,
				);
			}
			const wagers = { ...state.fjWagers, [intent.actorId]: intent.amount };
			const eligibleIds = fjEligiblePlayers(state).map((p) => p.id);
			const allIn = eligibleIds.every((id) => id in wagers);
			const next: GameState = {
				...state,
				fjWagers: wagers,
				phase: allIn ? "fj_answer" : "fj_wager",
				fjClueRevealed: allIn ? true : state.fjClueRevealed,
			};
			const broadcasts: ServerToClient[] = [
				{ type: "fj_wager_submitted", playerId: intent.actorId },
			];
			if (allIn && state.finalQuestion) {
				broadcasts.push({
					type: "fj_clue_revealed",
					clue: state.finalQuestion.clue,
				});
			}
			return ok(next, broadcasts);
		}

		case "fj_answer": {
			if (state.phase !== "fj_answer")
				throw new GameError("invalid_state", "Not collecting answers");
			const player = state.players[intent.actorId];
			if (!player || player.isHost)
				throw new GameError("forbidden", "Players only");
			const eligible = fjEligiblePlayers(state).some(
				(p) => p.id === intent.actorId,
			);
			if (!eligible)
				throw new GameError(
					"not_eligible",
					"You are not playing Final Jeopardy",
				);
			if (typeof intent.text !== "string" || intent.text.length > 200) {
				throw new GameError("validation_error", "Answer too long");
			}
			const answers = { ...state.fjAnswers, [intent.actorId]: intent.text };
			const eligibleIds = fjEligiblePlayers(state).map((p) => p.id);
			const allIn = eligibleIds.every((id) => id in answers);
			const next: GameState = {
				...state,
				fjAnswers: answers,
				phase: allIn ? "fj_judging" : "fj_answer",
			};
			const broadcasts: ServerToClient[] = [
				{ type: "fj_answer_submitted", playerId: intent.actorId },
			];
			if (allIn) {
				broadcasts.push({
					type: "fj_judging",
					results: eligibleIds.map((id) => ({
						playerId: id,
						wager: next.fjWagers[id] ?? 0,
						answer: next.fjAnswers[id] ?? "",
					})),
				});
			}
			return ok(next, broadcasts);
		}

		case "fj_judge": {
			requireHost(state, intent.actorId);
			if (state.phase !== "fj_judging")
				throw new GameError("invalid_state", "Not judging FJ");
			if (!(intent.playerId in state.fjAnswers))
				throw new GameError("not_found", "No FJ answer for that player");
			if (intent.playerId in state.fjJudged)
				throw new GameError("invalid_state", "Already judged");
			const wager = state.fjWagers[intent.playerId] ?? 0;
			const player = state.players[intent.playerId];
			if (!player) throw new GameError("not_found", "Unknown player");
			const delta =
				intent.verdict === "correct"
					? wager
					: intent.verdict === "incorrect"
						? -wager
						: 0;
			const newScore = player.score + delta;
			const nextPlayers = {
				...state.players,
				[intent.playerId]: { ...player, score: newScore },
			};
			const nextJudged = {
				...state.fjJudged,
				[intent.playerId]: intent.verdict,
			};
			const eligibleIds = fjEligiblePlayers(state).map((p) => p.id);
			const allJudged = eligibleIds.every((id) => id in nextJudged);
			const next: GameState = {
				...state,
				players: nextPlayers,
				fjJudged: nextJudged,
				phase: allJudged ? "completed" : "fj_judging",
			};
			const broadcasts: ServerToClient[] = [
				{
					type: "fj_judged",
					playerId: intent.playerId,
					verdict: intent.verdict,
					scoreDelta: delta,
					newScore,
				},
			];
			if (allJudged) {
				broadcasts.push({ type: "fj_done" });
				broadcasts.push({ type: "game_completed" });
			}
			return ok(next, broadcasts);
		}
	}
}

// ───── Time-driven transitions ─────

/**
 * Called by the room driver when wall-clock advances past `buzzOpensAtMs`.
 * Pure: caller passes nowMs; we decide whether to transition.
 */
export function tickReadDelay(
	state: GameState,
	nowMs: number,
): TransitionResult {
	if (state.phase !== "reading" || state.buzzOpensAtMs === null)
		return ok(state);
	if (nowMs < state.buzzOpensAtMs) return ok(state);
	return ok({ ...state, phase: "buzz_open" }, [{ type: "buzz_open" }]);
}
