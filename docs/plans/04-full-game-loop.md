# Sub-plan 04 — Full game loop

> Fourth implementation slice from [`../plan.md`](../plan.md). Builds
> on slice 03 (one-buzz spike). End of slice: a complete game can be
> played from lobby through the main round (with re-buzz on wrong
> answers and Daily Doubles) into Final Jeopardy and a persisted
> results screen that survives a server restart.

## Context

Slice 03 proved the realtime architecture on a single question. The
gameplay it ships is not yet a Jeopardy game — there's no second
chance to buzz, no DD wager, no Final round, no end screen. Slice 04
turns the spike into something demo-able. Each subsystem here is
either a state-machine extension (re-buzz, DD, FJ) or a persistence
+ UI layer on top of state already passing through the system
(results screen).

## Scope (and limits)

In:
- **Re-buzz cycle (FR-MG6)**: an incorrect / no-answer verdict
  returns the question to `buzz_open` with the buzzed player added
  to the per-question lockout. Question closes when correct, when
  every non-host player has been judged, or when the host closes it.
- **Daily Double (FR-DD1–3)**: only the picking player can buzz /
  answer, after wagering 5 ≤ wager ≤ max(currentScore, maxRemaining).
- **Final Jeopardy (FR-FJ1–4)**: optional per-game (`options.finalEnabled`).
  Players with score ≤ 0 skip. Hidden wagers, then clue, then hidden
  answers, then host judges each in turn.
- **Picker rotation**: after a question closes, the most recent
  correct answerer becomes the next picker (host override available).
  First picker = the host (host-pick-then-rotate keeps slice scope
  small).
- **Per-game options UI**: a tiny dialog before "Host game" starts
  the lobby, exposing `finalEnabled` and `readDelayMs` (default 3 s).
- **Results screen** at `/games/$roomCode/result`: persisted ranking
  + scores, accessible after the server restarts. Linked from host
  and player views when the game completes.
- **Game history page** at `/games`: list games the user hosted or
  played in, most recent first; click → results screen.

Out (deferred):
- Pause / resume (FR-R3) — slice 06 polish.
- Host abort (FR-G4) — slice 06 polish.
- Player kick (FR-L2) — slice 06 polish.
- 5/10-min reconnect grace timeouts (FR-R1, FR-R3) — slice 06 polish.
- Email-verification gate on hosting (FR-A2) — slice 06 polish.
- Media in questions — slice 05.

## Decisions made for this slice

| Question | Decision | Reason |
| --- | --- | --- |
| Picker after a question closes | **Most recent correct answerer**; if no one was correct on this question, the previous picker stays. First picker = host (host can also override at any time during `picking`). | Matches Jeopardy. Host-override avoids the "what if the picker disconnects" corner without a sub-plan of its own. |
| Re-buzz: are early-buzz lockouts cleared between buzz cycles within a question? | **No**. An early-buzz lockout (already enforced in slice 03) and a "you already had your shot and were wrong" lockout are stored in the same `lockedOutOnCurrent` set and cleared only when the question closes. | Symmetric and easy to reason about. |
| When all eligible players have been judged on a question, what closes it? | The state machine closes it automatically on `judge` if the locked-out set covers every non-host player. Broadcasts `question_closed` with the original `pointValue`. No new client message. | Lives in one place (the transition function). Tested. |
| DD wager bounds | **`max(5, max remaining point value, current score)`** for the maximum. Floor is **5**. Server enforces; client UI enforces too for UX. | Matches Jeopardy "true daily double". The client gets the bounds in `daily_double_pending`. |
| DD scoring on no-answer | Treat as **incorrect** (subtract wager). | Real Jeopardy uses no-answer for the main round but DD requires the picker to answer; if they don't, they lose the wager. Simpler. |
| FJ category reveal | The category title (a string from the snapshot's `final_question.category`) is shown to players the moment FJ starts — clue is hidden until all wagers are in. | Per FR-FJ1. |
| FJ wager input visibility | Wagers are private to each player + host. Other players see only "wager submitted" badges. | Per FR-FJ2. |
| FJ answers | Free-text submitted by each player, broadcast to host (and to other players only after judging that player). | Per FR-FJ3. |
| Players with score ≤ 0 | Sit out FJ entirely — see "Skipping (score ≤ 0)". Final scoreboard still includes them. | Per FR-FJ2. |
| Persisted results | On `game_completed`, write a `game.endedAt` and a single row in a new `game_result` table holding the final ranking JSON. The results endpoint reads from `game_result` first, falls back to in-memory state if the row isn't there yet. | Survives a server restart. Avoids replaying `game_event` for the common case. |
| `/games/:roomCode/result` auth | **Public if completed, else 404.** No history-leak when the game is still in flight. | Mask-existence pattern, consistent with `/share/:token`. |
| Game history `GET /games/history` | Authed only; lists games where `host_id = me` or `game_player.user_id = me`, sorted by `started_at DESC`. | Matches `api.md` §2.6. |
| Wager UX | DD: numeric input with "min" and "max" hints; submit button. FJ: same. No slider for v1. | Numeric input is keyboard- and mobile-friendly without extra components. |

## Deliverables

By end of slice:

1. **State machine extensions** in `apps/server/src/game/state.ts`:
   - New phases: `dd_wagering`, `fj_category`, `fj_wager`, `fj_clue`,
     `fj_answer`, `fj_judging`, `fj_done`.
   - New intents: `wager`, `start_final`, `fj_wager`, `fj_answer`,
     `fj_judge`, `set_picker` (host override).
   - Re-buzz logic on `judge` for non-correct verdicts in the main
     round.
   - Picker rotation on correct answers.
   - Wager bounds enforced server-side.
2. **Protocol additions** in `protocol.ts` matching `api.md` §3.5:
   - `wager_pending`, `clue_revealed`, `daily_double_pending`,
     `fj_category`, `fj_clue`, `fj_answers`, `fj_done`,
     `picker_changed`.
3. **Schema additions**:
   - `game_result` table: `game_id PK FK`, `ranking jsonb`, `created_at`.
   - `game.options` reads gain `finalEnabled: boolean`.
   - Drizzle migration generated and applied.
4. **HTTP endpoints**:
   - `GET /games/:roomCode/result` (public if completed).
   - `GET /games/history` (authed).
5. **Web pages**:
   - `/host/$roomCode` extended: DD wager prompt, FJ controls, per-
     player FJ judging UI, picker indicator, set-picker action.
   - `/play/$roomCode` extended: DD wager input (only for picker),
     FJ wager + answer inputs, "skipping FJ" badge for ineligible
     players.
   - `/games/$roomCode/result` (public): final scoreboard + share-
     able URL.
   - `/games` (history): list of past games for the current user.
6. **Tests** (per CLAUDE.md Testing rule):
   - **State machine** (extension of `game-state.test.ts`):
     - Re-buzz on incorrect; question closes when all non-host
       players have been judged.
     - Daily Double end-to-end: only picker may buzz; wager
       enforced; correct/incorrect/no-answer scoring.
     - Final Jeopardy end-to-end with two players, one ineligible
       (score 0); wager bounds; per-player judging.
     - Picker rotation after correct answer.
   - **HTTP**: `GET /games/:roomCode/result` returns 404 mid-game,
     200 + ranking after `game_completed`. `GET /games/history` lists
     hosted + played-in games for the caller and excludes others.
   - **WS integration**: new `games-ws.test.ts` cases for one
     re-buzz round and one DD round (FJ deferred to state-machine
     unit tests + manual since it has many sub-states).
   - **Web**: render the results page with a fixture and confirm
     ranking order; render the host DD prompt and confirm the wager
     submit flow updates the state.

## Critical files

### `apps/server`
- `src/db/schema.ts` — append `game_result`; extend `game.options`
  jsonb shape (no migration column, just a new key).
- `src/game/protocol.ts` — append message types listed above.
- `src/game/state.ts` — phase enum + transitions for DD, FJ, re-buzz,
  picker rotation. New `Intent` variants. Wager validators.
- `src/game/rooms.ts` — on transitions ending in
  `phase: 'completed'`, persist `game.endedAt` + insert
  `game_result` row (idempotent: skip if already present).
- `src/routes/games.ts` — `GET /games/:roomCode/result`,
  `GET /games/history`. Update `POST /games` body to accept
  `options.finalEnabled`.
- `src/routes/games-ws.ts` — pass new client intents through
  (mostly auto via the existing intent map).

### `apps/web`
- `src/stores/game.ts` — handle new server→client messages.
- `src/routes/host.$roomCode.tsx` — DD wager card, FJ controls,
  picker badge + override.
- `src/routes/play.$roomCode.tsx` — DD wager input (picker only),
  FJ wager + answer inputs, ineligible badge.
- `src/routes/games.$roomCode.result.tsx` *(new)* — public results
  page.
- `src/routes/_auth/games.tsx` *(new)* — history page.
- `src/components/game/wager-input.tsx` *(new)* — numeric input
  with min/max + submit; reused for DD and FJ.

### Tests
- `apps/server/test/game-state.test.ts` — DD, FJ, re-buzz, picker
  rotation cases.
- `apps/server/test/games-ws.test.ts` — re-buzz + DD WS tests.
- `apps/server/test/games-result.test.ts` *(new)* — `result` and
  `history` HTTP tests.
- `apps/web/test/results-page.test.tsx` *(new)*.
- `apps/web/test/host-dd.test.tsx` *(new)*.

## Step-by-step

Each numbered step ships with tests for what it added.

1. **Schema bump**: `game_result` table, migration applied. No
   behavioural change yet.
2. **Re-buzz**: extend `transition` for `judge` non-correct verdicts
   in the main round to return to `buzz_open` with the buzzed
   player added to lockout, OR auto-close the question when no
   eligible players remain. Update tests.
3. **Picker rotation**: track `currentPickerId`; on `judge` correct,
   set picker to that player; broadcast `picker_changed`. Add
   `set_picker` host override.
4. **Daily Double**: new phase `dd_wagering` after `select_question`
   when the picked question has `isDailyDouble`. Add `wager`
   intent + validators + `daily_double_pending` /
   `clue_revealed` broadcasts. Skip the buzz window — go straight
   to "answering" (state-machine-wise, treat as a buzzed picker).
   Tests cover bounds, picker-only, scoring.
5. **Final Jeopardy**: add `start_final` intent and the FJ phase
   chain. Per-player wagers + answers stored in state until
   judged. `fj_done` writes the new scores back into the player
   list. Tests cover bounds, ineligibility, full flow.
6. **Persistence on completion**: in `RoomDriver` (or a tiny
   afterTransition hook), when the new state has `phase ===
   'completed'`, persist `game.endedAt = now()` and insert
   `game_result` if not present. Idempotent.
7. **HTTP**: `GET /games/:roomCode/result` (404 mid-game, 200 with
   the ranking afterwards). `GET /games/history`.
8. **Web**: extend host + player views; add results page; add
   history page; pre-game options dialog with `finalEnabled`.
9. **Integration sweep**: run `bun test` and `bun run test`. Manual
   smoke: full game with two players, one DD, one FJ.

## Verification (definition of done)

- All `FR-MG*`, `FR-DD*`, `FR-FJ*`, `FR-C1`, `FR-C2` SRS
  requirements pass at least one automated test or manual
  verification step.
- `bun test` (server) and `bun run test` (web) green.
- `bunx tsc --noEmit` clean in both apps.
- `bun run lint` clean.
- `/docs/json` (OpenAPI) shows the new HTTP routes.
- Manual: full game with 2 players from "Host game" through Final
  Jeopardy → results page; reload the results page after
  restarting the dev server → still works.

## Risks / things to watch

- **State sprawl**: FJ alone introduces five phases. Keep transitions
  small and total over the new intents; lean on exhaustive
  `switch (intent.type)` so an unhandled intent fails to compile.
- **Wager validation parity**: the same bounds must hold on the
  client (UX) and server (truth). Compute on the server; broadcast
  the bounds in `daily_double_pending` / `wager_pending` so the
  client never recalculates. Server is authoritative.
- **Idempotency of completion persistence**: the
  `game_completed` broadcast happens in two places (last main
  question closing without FJ, and FJ done). Both must hit the
  persistence hook; the hook must no-op when the row already
  exists.
- **History page leak**: `/games/history` must exclude games where
  the caller was neither host nor player. SQL: `WHERE host_id = me
  OR EXISTS (game_player WHERE game_id = g.id AND user_id = me)`.
- **Picker rotation edge cases**: if the picker leaves before
  picking, the host can `set_picker` to anyone in the joined set.
  The auto-rotate only fires on `judge correct`; no change on
  incorrect / no_answer / close_question.
- **Mobile DD/FJ inputs**: numeric inputs on iOS need
  `inputmode="numeric"` to surface the number pad. Easy to forget.

## Then what?

Slice 05 — **Media**: the `Storage` interface, image + audio
upload, embedding media in questions and playing it during the
game. Touches the editor and both gameplay views, but no new
phases. After that, slice 06 is the polish pass that picks up the
deferred items (pause/abort, kick, reconnect timeouts, verification
gate, profile pages, mobile polish, error pages).
