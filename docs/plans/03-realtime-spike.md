# Sub-plan 03 — Realtime spike

> Third implementation slice from [`../plan.md`](../plan.md). Builds
> on slice 02 (quiz CRUD). End of slice: a host can open a game from
> their quiz, a player joins via room code, the host opens **one
> question**, the player buzzes, the host judges, the score updates
> on both screens, and a dropped client can reconnect and see the
> right state.

## Context

The realtime path is the highest-risk piece in v1. Validating the WS
protocol, the state machine, and reconnection on a single question
proves the architecture before we build the rest of the game loop in
slice 04. Per [`../plan.md`](../plan.md), if realtime ends up painful,
this is when we want to find out — not after profile pages and
mobile polish are built on top.

## Scope (and limits)

In:
- Game lifecycle states `Lobby → Active → Completed`
  (no Pause/Aborted yet).
- Per-question lifecycle for **one** question:
  `Open → BuzzWindow → Buzzed → Answering → Judged → Closed`.
- Host: pick a question on the board, open it, judge the buzzed
  player; score updates broadcast.
- Player: join, see board, buzz, see verdict + score.
- Reconnect: server-driven snapshot on every connect.
- Guest join (anonymous, with `guest_token` cookie scoped to the
  game).

Out (deferred to slice 04 / 05 / 06):
- Daily Double, Final Jeopardy.
- Re-buzz after wrong answer (FR-MG6) — single buzz cycle for v0.
- Pause / abort flows.
- Per-game options (timers, FJ enabled). Use defaults from SRS.
- Spectator view.
- Player kick.
- Reconnection grace timeout enforcement (5/10 min) — slot is held
  forever within an in-flight game in v0.
- Mobile-polish on the player buzzer (slice 06).
- Final scoreboard page.

## Decisions made for this slice

| Question | Decision | Reason |
| --- | --- | --- |
| Where the game state machine lives | **In-process Map** keyed by `roomCode`. No Redis. | Single-instance only (matches NFR / system-diagram OQ-INF-1). Cheaper to reason about; refactor when we scale out. |
| Snapshot vs deltas | **Full snapshot on connect**, **deltas thereafter**. | Spec already in `api.md` §3. Full snapshot simplifies reconnect. |
| Buzz tie-break | First WS frame wins by **server-side `performance.now()`** at message receipt. | Per FR-MG2, NFR-P1 — server-authoritative, no trust in client clocks. |
| Read delay before buzz window | **3 s** default per SRS FR-MG2. Configurable via game options column but UI to change deferred. | Sticks to documented defaults. |
| Game options storage | `game.options jsonb` populated with defaults at create time; no UI to override yet. | Schema-future-proof; UI in slice 04. |
| Snapshot column | `game_snapshot.quiz jsonb` on game create. The live game **only** reads from snapshot — never from the source quiz. | FR-G2; simplifies code path and matches sequence diagram §4. |
| Per-question state column | `game_question_state` rows, one per opened question, as in ERD. | Recovery from `game_event` is bonus; primary store is the row. |
| Host = WS auth | Cookie session AND `host_id == session.userId` proven on connect. Player = cookie session OR `guest_token`. | Matches sitemap §4. |
| Allowed-message enforcement | Server-side. Bad messages → close `4400` per `api.md` §3.2. | NFR-S3. |
| Test strategy for WS | Open a real WS via `app.handle()` won't work — Elysia WS needs a server. Bring up the app on a random port for the WS test only; HTTP tests stay in-process. | Pragmatic; isolated to a single test file. |
| Eden treaty for WS | Use Eden's `subscribe()` for the typed client. Fall back to a plain hook if Eden's WS type inference proves clumsy. | Eden gets us typed messages for free if it works; not worth fighting. |

## Deliverables

By end of slice:

1. **Schema additions** (Drizzle): `game`, `game_snapshot`,
   `game_player`, `game_question_state`, `game_event`. Migration
   generated and applied.
2. **HTTP endpoints**:
   - `POST /games` (host creates game from a quiz, snapshots it)
   - `GET /games/:roomCode` (basic lookup; for the page bootstrap)
   - `POST /games/:roomCode/join` (guest or user)
3. **WS endpoint** at `/ws/games/:roomCode` carrying:
   - `client → server`: `start_game`, `select_question`,
     `open_question`, `buzz`, `judge`, `close_question`, `leave`,
     `ping`
   - `server → client`: `snapshot`, `player_joined`,
     `player_left`, `game_started`, `question_open`, `buzz_open`,
     `buzzed`, `judged`, `state_changed`, `pong`, `error`
4. **Game state machine** in `src/game/state.ts`:
   - Pure functions over a typed state object.
   - Transitions return new state + outbound events.
   - Easy to unit-test without touching WS plumbing.
5. **Room registry** in `src/game/rooms.ts`:
   - In-memory `Map<roomCode, Room>` with the live state +
     subscribed sockets.
   - `getOrLoad(roomCode)` reads from DB + snapshot on first touch
     (so a server restart can resume an in-flight game).
6. **Web pages**:
   - `/join` — public form (room code + display name).
   - `/play/$roomCode` — player view: scoreboard, board (read-only
     selection), buzzer, current-question card.
   - `/host/$roomCode` — host view: scoreboard, board (clickable),
     question card with judge buttons.
   - "Host game" button in the quiz editor that calls `POST /games`
     and navigates to `/host/$roomCode`.
7. **Zustand `gameStore`** (one per game) hydrated from the WS
   snapshot, updated by deltas. Exposes a typed `send(...)` action.
8. **Tests**:
   - **Server unit**: state machine transitions —
     buzz before window → no-op + lockout; buzz after open → buzzed;
     judge correct → score+; judge incorrect → score-; close →
     terminal.
   - **Server integration**: real WS over a port —
     two players join, host opens question, P1 buzzes first, judge
     correct, both clients receive `judged` with the right score
     delta.
   - **Server integration**: reconnect — kill the WS, reopen,
     receive a snapshot that matches the current state.
   - **Web**: `useGameSocket` hook unit (mock WebSocket) — applies a
     `snapshot` then a `buzzed` delta correctly into the store.

## Critical files

### `apps/server`
- `src/db/schema.ts` — append game tables.
- `src/lib/room-code.ts` *(new)* — generates a 6-char room code from
  the curated alphabet (`BCDFGHJKLMNPQRSTVWXYZ`) with retry on
  collision.
- `src/game/state.ts` *(new)* — pure state machine (types +
  transition functions). No I/O.
- `src/game/rooms.ts` *(new)* — in-memory registry; loads from DB
  on first touch.
- `src/game/protocol.ts` *(new)* — message type definitions
  (discriminated unions for c→s and s→c).
- `src/routes/games.ts` *(new)* — HTTP routes for game create / join
  / lookup.
- `src/routes/games-ws.ts` *(new)* — WS handler.
- `src/app.ts` — `.use(games).use(gamesWs)`.
- `src/auth.ts` *(if needed)* — extend cookie config for the
  `guest_token` cookie (path-scoped to the game URL).

### `apps/web`
- `src/lib/game-socket.ts` *(new)* — WS client hook backed by
  Eden's WS (or a plain `WebSocket` wrapper) that hydrates and
  updates the per-game Zustand store.
- `src/stores/game.ts` *(new)* — Zustand store: live game state.
- `src/routes/join.tsx` *(new)* — form.
- `src/routes/play.$roomCode.tsx` *(new)* — player view.
- `src/routes/host.$roomCode.tsx` *(new)* — host view.
- `src/components/game/board.tsx` *(new)*, `buzzer.tsx`,
  `scoreboard.tsx`, `question-card.tsx`.
- `src/routes/_auth/quizzes/$quizId.tsx` — add a "Host game"
  button next to "Share".

### Tests
- `apps/server/test/game-state.test.ts` *(new)*.
- `apps/server/test/games.http.test.ts` *(new)*.
- `apps/server/test/games-ws.test.ts` *(new)* — boots app on an
  ephemeral port; opens real WS connections.
- `apps/web/test/game-socket.test.ts` *(new)*.

## Step-by-step

Each numbered step gets its own commit with passing tests, per
[`../../CLAUDE.md`](../../CLAUDE.md) Testing rule.

1. **Schema + migration** for the five game tables. Confirm
   `psql \dt`.
2. **Pure state machine** + unit tests. No WS, no DB. Just
   `transition(state, event) → { state, broadcast }`.
3. **Room code generator** + unit test (alphabet, length, retry on
   `unique` violation handled at the route layer).
4. **`POST /games`** — picks a code, snapshots the quiz tree, inserts
   `game` + `game_snapshot` + creates the host's `game_player` slot.
   Test: 201 returns `roomCode`; second call by same host → 409.
5. **`POST /games/:roomCode/join`** — guest cookie issued if not
   logged in. Test: capacity (default 6), idempotent rejoin by same
   `guest_token`.
6. **WS handler** for join / snapshot / buzz / judge subset. Test:
   real WS on ephemeral port, two clients see consistent state.
7. **Web socket hook + store**, **player & host views**.
   Manual smoke: open both pages, click through one question. Web
   unit test for the store reducer.
8. **Reconnect test**: kill a player WS, reopen, expect snapshot
   reflects the current state (scores, current question, buzzed
   player).
9. **Hook up "Host game" in editor.** Manual end-to-end: create
   quiz → host → join from incognito → run one question → see score
   change.

## Verification (definition of done)

- All five new tables present, migration applied.
- HTTP tests for `POST /games`, `POST /games/:roomCode/join` pass.
- State machine unit tests pass.
- Real-WS integration test (two clients, one buzz cycle, one
  reconnect) passes.
- Web `bun run test` includes the socket-hook unit and stays green.
- Manual: full happy path host + player on two browsers, one
  question, score updates within the SRS NFR-P1 latency target on a
  local network (<150 ms).
- `bun run lint` clean across both apps.
- `bunx tsc --noEmit` clean in both apps.
- `/docs/json` includes the new HTTP routes (auto via OpenAPI).

## Risks / things to watch

- **Eden WS typing**: not as polished as treaty for HTTP. If it
  fights us, fall back to a plain `WebSocket` + a hand-typed
  `ServerToClient` union imported from `server/src/game/protocol.ts`.
  Either way the **types come from the server**, never duplicated.
- **Cookie scoping for `guest_token`**: must be `Path=/` (or at
  least `/games/:roomCode`) and not collide across rooms. We'll
  store the room code on the cookie name suffix (`guest_token_:room`)
  to be safe.
- **Race between `select_question` and `open_question`**: lock the
  state machine to require selection before opening. State machine
  test covers it.
- **In-memory registry on a single instance** is fine for v1 but
  any horizontal scale-out needs Redis pub/sub — already noted in
  `system-diagram.md` OQ-INF-1.
- **Test flakiness on real WS**: use unique ports per test,
  `await once(socket, 'open')` instead of `setTimeout`. Treat
  snapshots as the synchronisation point.
- **better-auth + custom cookie**: avoid touching the
  `better-auth.session_token` cookie. Our `guest_token` is a
  separate, path-scoped cookie issued by `POST /join` only.
- **Snapshot column size**: a quiz with media URLs will be small (a
  few KB). Audio/image binary stays in storage; only references in
  the snapshot. No size concern.

## Then what?

Slice 04 — full game loop: re-buzz after wrong answers, Daily
Double, Final Jeopardy, end-of-game results page. Re-uses everything
from this spike and exercises the corners.
