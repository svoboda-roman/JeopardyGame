// WebSocket protocol for /ws/games/:roomCode.
// Source of truth for client/server message shapes; the web client
// imports these types via the `server` workspace.

export type Phase =
  | 'lobby'
  | 'picking'
  | 'reading'
  | 'buzz_open'
  | 'buzzed'
  | 'completed'

export type PlayerStatus = 'joined' | 'left' | 'kicked' | 'disconnected'

export interface PlayerView {
  id: string
  displayName: string
  score: number
  status: PlayerStatus
  isHost: boolean
}

export interface QuestionView {
  ref: string // id within the snapshot
  categoryRef: string
  pointValue: number
  isDailyDouble: boolean
  clue: string
  answer: string
}

export interface BoardCategoryView {
  ref: string
  position: number
  title: string
  questions: { ref: string; position: number; pointValue: number; closed: boolean }[]
}

export interface GameView {
  roomCode: string
  hostId: string
  phase: Phase
  players: PlayerView[]
  board: BoardCategoryView[]
  currentQuestion: QuestionView | null
  /** When the buzz window opens, ISO 8601, only set in `reading` */
  buzzOpensAt: string | null
  /** Player currently buzzed in (only set in `buzzed`) */
  currentPlayerId: string | null
}

// ───── client → server ─────

export type ClientToServer =
  | { type: 'start_game' }
  | { type: 'select_question'; questionRef: string }
  | { type: 'open_question' }
  | { type: 'close_question' }
  | { type: 'buzz' }
  | { type: 'judge'; verdict: 'correct' | 'incorrect' | 'no_answer' }
  | { type: 'leave' }
  | { type: 'ping' }

// ───── server → client ─────

export type ServerToClient =
  | { type: 'snapshot'; game: GameView; you: { playerId: string } }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'player_left'; playerId: string; reason: 'leave' | 'kicked' | 'disconnect' }
  | { type: 'game_started' }
  | { type: 'question_open'; question: QuestionView; opensBuzzAt: string }
  | { type: 'buzz_open' }
  | { type: 'buzzed'; playerId: string }
  | {
      type: 'judged'
      playerId: string
      verdict: 'correct' | 'incorrect' | 'no_answer'
      scoreDelta: number
      newScore: number
    }
  | { type: 'question_closed'; questionRef: string }
  | { type: 'game_completed' }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string }
