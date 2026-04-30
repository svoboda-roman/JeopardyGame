import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { app } from '../src/app.ts'
import type { ServerToClient } from '../src/game/protocol.ts'
import { evictAllRooms } from '../src/game/rooms.ts'
import { call, signUpAndGetCookie } from './helpers.ts'

let wsBase: string

beforeAll(() => {
  app.listen(0)
  const server = (app as unknown as { server?: { port?: number } }).server
  const port = server?.port ?? 0
  wsBase = `ws://localhost:${port}`
})

afterAll(() => {
  evictAllRooms()
  // Don't stop the server here — Bun's runtime exits when the test
  // process ends. Awaiting server.stop() with active WS sockets hangs.
})

async function createQuiz(cookie: string) {
  const res = await call('/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'WS Quiz' }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { quiz: { id: string } }).quiz
}

async function createGame(cookie: string, quizId: string): Promise<string> {
  const res = await call('/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ quizId, options: { readDelayMs: 50 } }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { game: { roomCode: string } }).game.roomCode
}

async function joinAsGuest(roomCode: string, displayName: string): Promise<string> {
  const res = await call(`/games/${roomCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  })
  expect(res.status).toBe(200)
  const setCookies =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get('set-cookie') ?? '']
  for (const c of setCookies) {
    const m = c.match(new RegExp(`guest_token_${roomCode}=([^;]+)`))
    if (m) return `guest_token_${roomCode}=${m[1]}`
  }
  throw new Error('no guest cookie')
}

interface Recorder {
  ws: WebSocket
  messages: ServerToClient[]
  waitFor(pred: (m: ServerToClient) => boolean, timeoutMs?: number): Promise<ServerToClient>
}

async function openSocket(roomCode: string, cookie: string): Promise<Recorder> {
  const ws = new WebSocket(`${wsBase}/ws/games/${roomCode}`, {
    headers: { cookie },
  } as unknown as undefined)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
    setTimeout(() => reject(new Error('open timeout')), 5000)
  })
  const messages: ServerToClient[] = []
  const waiters: { pred: (m: ServerToClient) => boolean; resolve: (m: ServerToClient) => void }[] = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data)) as ServerToClient
    messages.push(m)
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]!
      if (w.pred(m)) {
        waiters.splice(i, 1)
        w.resolve(m)
      }
    }
  })
  return {
    ws,
    messages,
    waitFor(pred, timeoutMs = 3000) {
      const found = messages.find(pred)
      if (found) return Promise.resolve(found)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`timeout waiting; got [${messages.map((m) => m.type).join(',')}]`))
        }, timeoutMs)
        waiters.push({
          pred,
          resolve: (m) => {
            clearTimeout(timer)
            resolve(m)
          },
        })
      })
    },
  }
}

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload))
}

describe('WS /ws/games/:roomCode — buzz cycle', () => {
  let hostCookie: string
  let roomCode: string

  beforeEach(async () => {
    hostCookie = await signUpAndGetCookie('Host')
    const quiz = await createQuiz(hostCookie)
    roomCode = await createGame(hostCookie, quiz.id)
  })

  it('host + 2 players: snapshot, start, open question, p1 buzzes, host judges, scores update', async () => {
    const guestCookie1 = await joinAsGuest(roomCode, 'Player One')
    const guestCookie2 = await joinAsGuest(roomCode, 'Player Two')

    const host = await openSocket(roomCode, hostCookie)
    const p1 = await openSocket(roomCode, guestCookie1)
    const p2 = await openSocket(roomCode, guestCookie2)

    await host.waitFor((m) => m.type === 'snapshot')
    await p1.waitFor((m) => m.type === 'snapshot')
    await p2.waitFor((m) => m.type === 'snapshot')

    send(host.ws, { type: 'start_game' })
    await Promise.all([
      host.waitFor((m) => m.type === 'game_started'),
      p1.waitFor((m) => m.type === 'game_started'),
      p2.waitFor((m) => m.type === 'game_started'),
    ])

    const snap = p1.messages.find((m) => m.type === 'snapshot')
    if (!snap || snap.type !== 'snapshot') throw new Error('no snapshot')
    const firstCat = snap.game.board[0]!
    const firstQ = firstCat.questions[0]!
    send(host.ws, { type: 'select_question', questionRef: firstQ.ref })
    send(host.ws, { type: 'open_question' })

    await Promise.all([
      host.waitFor((m) => m.type === 'question_open'),
      p1.waitFor((m) => m.type === 'question_open'),
    ])

    await p1.waitFor((m) => m.type === 'buzz_open', 2000)
    await p2.waitFor((m) => m.type === 'buzz_open', 2000)

    send(p1.ws, { type: 'buzz' })
    send(p2.ws, { type: 'buzz' })

    await host.waitFor((m) => m.type === 'buzzed')
    send(host.ws, { type: 'judge', verdict: 'correct' })
    const judged = await p1.waitFor((m) => m.type === 'judged')
    if (judged.type !== 'judged') throw new Error('unreachable')
    expect(judged.verdict).toBe('correct')
    expect(judged.scoreDelta).toBe(firstQ.pointValue)
    expect(judged.newScore).toBe(firstQ.pointValue)

    host.ws.close()
    p1.ws.close()
    p2.ws.close()
  })

  it('reconnect: a player who drops then returns receives a snapshot reflecting current state', async () => {
    const guestCookie = await joinAsGuest(roomCode, 'Rejoiner')

    const first = await openSocket(roomCode, guestCookie)
    await first.waitFor((m) => m.type === 'snapshot')
    first.ws.close()
    await new Promise((r) => setTimeout(r, 50))

    const host = await openSocket(roomCode, hostCookie)
    await host.waitFor((m) => m.type === 'snapshot')
    send(host.ws, { type: 'start_game' })
    await host.waitFor((m) => m.type === 'game_started')

    const second = await openSocket(roomCode, guestCookie)
    const snap = await second.waitFor((m) => m.type === 'snapshot')
    if (snap.type !== 'snapshot') throw new Error('unreachable')
    expect(snap.game.phase).toBe('picking')

    host.ws.close()
    second.ws.close()
  })

  it('rejects a connection from a non-member with close 4403', async () => {
    const stranger = await signUpAndGetCookie('Stranger')
    const ws = new WebSocket(`${wsBase}/ws/games/${roomCode}`, {
      headers: { cookie: stranger },
    } as unknown as undefined)
    const code = await new Promise<number>((resolve) => {
      ws.addEventListener('close', (ev) => resolve(ev.code), { once: true })
    })
    expect(code).toBe(4403)
  })
})
