// WebSocket protocol for /ws/games/:roomCode.
// Source of truth for client/server message shapes; the web client
// imports these types via the `server` workspace.

export type Phase =
	| "lobby"
	| "picking"
	| "reading"
	| "buzz_open"
	| "buzzed"
	| "dd_wagering"
	| "fj_wager"
	| "fj_answer"
	| "fj_judging"
	| "completed";

export type PlayerStatus = "joined" | "left" | "kicked" | "disconnected";

export interface PlayerView {
	id: string;
	displayName: string;
	score: number;
	status: PlayerStatus;
	isHost: boolean;
}

export interface QuestionMediaView {
	id: string;
	mime: string;
	url: string;
}

export interface QuestionView {
	ref: string; // id within the snapshot
	categoryRef: string;
	pointValue: number;
	isDailyDouble: boolean;
	clue: string;
	answer: string;
	media: QuestionMediaView[];
	answerMedia: QuestionMediaView[];
	youtubeId: string | null;
	answerYoutubeId: string | null;
}

export interface BoardCategoryView {
	ref: string;
	position: number;
	title: string;
	questions: {
		ref: string;
		position: number;
		pointValue: number;
		closed: boolean;
	}[];
}

export interface FinalJeopardyView {
	/** Category, always visible once FJ starts. */
	category: string;
	/** Clue, visible to everyone once all wagers are in. */
	clue: string | null;
	/** Correct answer, visible only to the host once revealed. */
	answer: string | null;
	/** Player ids who have submitted a wager (amount stays private). */
	wagersSubmitted: string[];
	/** Player ids who have submitted an answer (text stays private until judging). */
	answersSubmitted: string[];
	/**
	 * Per-player wager + answer + verdict, exposed during fj_judging and
	 * after. `verdict: null` means the host hasn't judged that player yet.
	 */
	results: {
		playerId: string;
		wager: number;
		answer: string;
		verdict: "correct" | "incorrect" | "no_answer" | null;
	}[];
}

export interface GameView {
	roomCode: string;
	hostId: string;
	phase: Phase;
	manualPoints: boolean;
	players: PlayerView[];
	board: BoardCategoryView[];
	currentQuestion: QuestionView | null;
	/** When the buzz window opens, ISO 8601, only set in `reading` */
	buzzOpensAt: string | null;
	/** Player currently buzzed in (only set in `buzzed`) */
	currentPlayerId: string | null;
	/** Player currently allowed to pick a question on the board. */
	currentPickerId: string | null;
	/** Wager on the current question (Daily Double). Null otherwise. */
	currentWager: number | null;
	/** Set when the game has Final Jeopardy enabled and a final question. */
	finalJeopardy: FinalJeopardyView | null;
}

// ───── client → server ─────

export type ClientToServer =
	| { type: "start_game" }
	| { type: "select_question"; questionRef: string }
	| { type: "open_question" }
	| { type: "close_question" }
	| { type: "buzz" }
	| { type: "judge"; verdict: "correct" | "incorrect" | "no_answer" }
	| { type: "wager"; amount: number }
	| { type: "start_final" }
	| { type: "fj_wager"; amount: number }
	| { type: "fj_answer"; text: string }
	| {
			type: "fj_judge";
			playerId: string;
			verdict: "correct" | "incorrect" | "no_answer";
	  }
	| { type: "set_picker"; playerId: string }
	| { type: "adjust_score"; playerId: string; delta: number }
	| { type: "leave" }
	| { type: "ping" };

// ───── server → client ─────

export type ServerToClient =
	| { type: "snapshot"; game: GameView; you: { playerId: string } }
	| { type: "player_joined"; player: PlayerView }
	| {
			type: "player_left";
			playerId: string;
			reason: "leave" | "kicked" | "disconnect";
	  }
	| { type: "game_started" }
	| { type: "question_open"; question: QuestionView; opensBuzzAt: string }
	| { type: "buzz_open" }
	| { type: "buzzed"; playerId: string }
	| {
			type: "judged";
			playerId: string;
			verdict: "correct" | "incorrect" | "no_answer";
			scoreDelta: number;
			newScore: number;
	  }
	| { type: "question_closed"; questionRef: string }
	| { type: "picker_changed"; playerId: string | null }
	| {
			type: "daily_double_pending";
			pickerId: string;
			categoryRef: string;
			min: number;
			max: number;
	  }
	| {
			type: "clue_revealed";
			question: QuestionView;
			wager: number;
			pickerId: string;
	  }
	| { type: "fj_started"; category: string; eligible: string[] }
	| { type: "fj_wager_submitted"; playerId: string }
	| { type: "fj_clue_revealed"; clue: string }
	| { type: "fj_answer_submitted"; playerId: string }
	| {
			type: "fj_judging";
			results: { playerId: string; wager: number; answer: string }[];
	  }
	| {
			type: "fj_judged";
			playerId: string;
			verdict: "correct" | "incorrect" | "no_answer";
			scoreDelta: number;
			newScore: number;
	  }
	| { type: "fj_done" }
	| { type: "game_completed" }
	| {
			type: "score_adjusted";
			playerId: string;
			delta: number;
			newScore: number;
	  }
	| { type: "pong" }
	| { type: "error"; code: string; message: string };
