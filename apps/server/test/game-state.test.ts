import { beforeEach, describe, expect, it } from 'bun:test'
import {
  type GameState,
  type InternalBoard,
  GameError,
  addPlayer,
  newGame,
  tickReadDelay,
  transition,
} from '../src/game/state.ts'

function tinyBoard(): InternalBoard {
  // 1 category, 2 questions for fast tests.
  return {
    categories: [{ ref: 'c1', position: 0, title: 'Test', questionRefs: ['q1', 'q2'] }],
    questions: {
      q1: {
        ref: 'q1',
        categoryRef: 'c1',
        position: 0,
        pointValue: 100,
        isDailyDouble: false,
        clue: 'clue 1',
        answer: 'answer 1',
      },
      q2: {
        ref: 'q2',
        categoryRef: 'c1',
        position: 1,
        pointValue: 200,
        isDailyDouble: false,
        clue: 'clue 2',
        answer: 'answer 2',
      },
    },
  }
}

let state: GameState

beforeEach(() => {
  state = newGame({
    roomCode: 'ABCDEF',
    hostId: 'u-host',
    hostPlayer: { id: 'p-host', displayName: 'Host' },
    board: tinyBoard(),
    options: { readDelayMs: 1000 },
  })
})

describe('lobby + start', () => {
  it('cannot start without ≥ 1 non-host player', () => {
    expect(() => transition(state, { type: 'start_game', actorId: 'p-host' })).toThrow(GameError)
  })

  it('non-host cannot start', () => {
    const r = addPlayer(state, { id: 'p1', displayName: 'P1' })
    expect(() => transition(r.state, { type: 'start_game', actorId: 'p1' })).toThrow(GameError)
  })

  it('host with 1 player → picking + game_started', () => {
    state = addPlayer(state, { id: 'p1', displayName: 'P1' }).state
    const r = transition(state, { type: 'start_game', actorId: 'p-host' })
    expect(r.state.phase).toBe('picking')
    expect(r.broadcasts.some((b) => b.type === 'game_started')).toBe(true)
  })
})

describe('one-question buzz cycle', () => {
  beforeEach(() => {
    state = addPlayer(state, { id: 'p1', displayName: 'P1' }).state
    state = addPlayer(state, { id: 'p2', displayName: 'P2' }).state
    state = transition(state, { type: 'start_game', actorId: 'p-host' }).state
    state = transition(state, {
      type: 'select_question',
      actorId: 'p-host',
      questionRef: 'q1',
    }).state
    state = transition(state, { type: 'open_question', actorId: 'p-host', nowMs: 1000 }).state
    // phase is now 'reading', buzzOpensAtMs = 2000
  })

  it('early buzz during reading → no transition + lockout + error broadcast', () => {
    const r = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 1500 })
    expect(r.state.phase).toBe('reading')
    expect(r.state.lockedOutOnCurrent.has('p1')).toBe(true)
    expect(r.broadcasts.some((b) => b.type === 'error')).toBe(true)
  })

  it('tick at buzzOpensAt → buzz_open + buzz_open broadcast', () => {
    const r = tickReadDelay(state, 2000)
    expect(r.state.phase).toBe('buzz_open')
    expect(r.broadcasts.some((b) => b.type === 'buzz_open')).toBe(true)
  })

  it('buzz after open → buzzed + currentPlayerId set', () => {
    state = tickReadDelay(state, 2000).state
    const r = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 2050 })
    expect(r.state.phase).toBe('buzzed')
    expect(r.state.currentPlayerId).toBe('p1')
    expect(r.broadcasts.some((b) => b.type === 'buzzed' && b.playerId === 'p1')).toBe(true)
  })

  it('locked-out player cannot buzz after open', () => {
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 1500 }).state
    state = tickReadDelay(state, 2000).state
    expect(() => transition(state, { type: 'buzz', actorId: 'p1', nowMs: 2050 })).toThrow(
      GameError,
    )
  })

  it('only first buzz wins; second buzz fails', () => {
    state = tickReadDelay(state, 2000).state
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 2050 }).state
    expect(() => transition(state, { type: 'buzz', actorId: 'p2', nowMs: 2060 })).toThrow(
      GameError,
    )
  })

  it('host cannot buzz', () => {
    state = tickReadDelay(state, 2000).state
    expect(() => transition(state, { type: 'buzz', actorId: 'p-host', nowMs: 2050 })).toThrow(
      GameError,
    )
  })

  it('judge correct → score+; closes question; back to picking', () => {
    state = tickReadDelay(state, 2000).state
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 2050 }).state
    const r = transition(state, { type: 'judge', actorId: 'p-host', verdict: 'correct' })
    expect(r.state.phase).toBe('picking')
    expect(r.state.players['p1']!.score).toBe(100)
    expect(r.state.closedQuestions.has('q1')).toBe(true)
    const judged = r.broadcasts.find((b) => b.type === 'judged')
    expect(judged).toMatchObject({ playerId: 'p1', verdict: 'correct', scoreDelta: 100, newScore: 100 })
  })

  it('judge incorrect → score-; closes question (re-buzz deferred to slice 04)', () => {
    state = tickReadDelay(state, 2000).state
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 2050 }).state
    const r = transition(state, { type: 'judge', actorId: 'p-host', verdict: 'incorrect' })
    expect(r.state.players['p1']!.score).toBe(-100)
    expect(r.state.closedQuestions.has('q1')).toBe(true)
  })

  it('judge no_answer → no score change; closes question', () => {
    state = tickReadDelay(state, 2000).state
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 2050 }).state
    const r = transition(state, { type: 'judge', actorId: 'p-host', verdict: 'no_answer' })
    expect(r.state.players['p1']!.score).toBe(0)
    expect(r.state.closedQuestions.has('q1')).toBe(true)
  })
})

describe('completion', () => {
  it('closing the last question transitions to completed and broadcasts game_completed', () => {
    state = addPlayer(state, { id: 'p1', displayName: 'P1' }).state
    state = transition(state, { type: 'start_game', actorId: 'p-host' }).state

    // Close q1
    state = transition(state, { type: 'select_question', actorId: 'p-host', questionRef: 'q1' }).state
    state = transition(state, { type: 'open_question', actorId: 'p-host', nowMs: 0 }).state
    state = tickReadDelay(state, state.options.readDelayMs).state
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 100 }).state
    state = transition(state, { type: 'judge', actorId: 'p-host', verdict: 'no_answer' }).state

    // Close q2
    state = transition(state, { type: 'select_question', actorId: 'p-host', questionRef: 'q2' }).state
    state = transition(state, { type: 'open_question', actorId: 'p-host', nowMs: 1000 }).state
    state = tickReadDelay(state, 1000 + state.options.readDelayMs).state
    state = transition(state, { type: 'buzz', actorId: 'p1', nowMs: 5000 }).state
    const r = transition(state, { type: 'judge', actorId: 'p-host', verdict: 'no_answer' })

    expect(r.state.phase).toBe('completed')
    expect(r.broadcasts.some((b) => b.type === 'game_completed')).toBe(true)
  })
})

describe('lobby join rules', () => {
  it('can join during lobby and picking, but not during reading', () => {
    const r1 = addPlayer(state, { id: 'p1', displayName: 'P1' })
    expect(r1.state.players['p1']?.status).toBe('joined')
    expect(r1.broadcasts[0]?.type).toBe('player_joined')

    const started = transition(r1.state, { type: 'start_game', actorId: 'p-host' }).state
    const r2 = addPlayer(started, { id: 'p2', displayName: 'P2' })
    expect(r2.state.players['p2']).toBeTruthy()

    const opened = transition(r2.state, { type: 'select_question', actorId: 'p-host', questionRef: 'q1' }).state
    const reading = transition(opened, { type: 'open_question', actorId: 'p-host', nowMs: 0 }).state
    expect(() => addPlayer(reading, { id: 'p3', displayName: 'P3' })).toThrow(GameError)
  })

  it('joining the same player twice is a no-op', () => {
    const r1 = addPlayer(state, { id: 'p1', displayName: 'P1' })
    const r2 = addPlayer(r1.state, { id: 'p1', displayName: 'P1' })
    expect(Object.keys(r2.state.players)).toHaveLength(2) // host + p1
    expect(r2.broadcasts).toHaveLength(0)
  })
})
