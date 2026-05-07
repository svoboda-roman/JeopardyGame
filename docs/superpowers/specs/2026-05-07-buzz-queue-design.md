# Buzz Queue — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

---

## Problem

When multiple players buzz on the same question the server currently discards everyone except the first. After the host marks an answer incorrect, the buzzer window reopens and a new race begins. This loses the original ordering: a player who buzzed a split second after the winner had their intent thrown away.

---

## Goal

Track all buzz attempts in arrival order for the duration of a question. Give the host a "Next Player" button that immediately advances to the queued player without reopening a live buzz race.

---

## Architecture

### Server — `GameState`

Add one new field:

```ts
buzzQueue: string[]   // ordered player ids, no duplicates, cleared per question
```

Invariant: a player id appears in at most one of `currentPlayerId` or `buzzQueue`.

### Server — `buzz` transition

**When `phase === "buzz_open"` and `currentPlayerId` is null** (first buzz):  
Behaviour unchanged — set `currentPlayerId`, transition to `buzzed`, broadcast `buzzed`.

**When `phase === "buzz_open"` and `currentPlayerId` is already set** (subsequent buzz):  
This is a new case. If the player is not locked out and not already in the queue, append them to `buzzQueue` and broadcast a new `buzz_queue_updated` message. No phase change.

**When `phase === "buzz_open"` and player is already in queue:**  
Silently ignore (idempotent).

### Server — `next_player` intent

New host-only intent:

```ts
{ type: "next_player"; actorId: string }
```

- Allowed phases: `buzzed`
- Pops `buzzQueue[0]`; sets it as `currentPlayerId`; adds the previous `currentPlayerId` to `lockedOutOnCurrent`
- Phase stays `buzzed`
- Broadcasts `buzzed` (with new `playerId`) and `buzz_queue_updated`
- Error if queue is empty

### Server — `judge` transition (no_answer / incorrect)

Existing re-buzz logic (reopen `buzz_open`) is unchanged. The queue is **not** auto-consumed on judge — the host always drives advancement via "Next Player" or lets a new live buzz happen. This keeps the host in control.

On `close_question` and `question_closed`: clear `buzzQueue` (already cleared via `lockedOutOnCurrent` reset).

### Protocol — `GameView`

Add to `GameView`:

```ts
buzzQueue: string[]   // player ids in buzz order, visible to host only (sent to all for simplicity)
```

### Protocol — new server→client message

```ts
{ type: "buzz_queue_updated"; queue: string[] }
```

Sent whenever the queue changes (player appended, player popped via next_player).

### Protocol — new client→server message

```ts
{ type: "next_player" }
```

### Client — `game.ts` store

- On `snapshot`: hydrate `game.buzzQueue` from the snapshot
- On `buzzed`: no change needed (queue visible via `game.buzzQueue`)
- On `buzz_queue_updated`: update `game.buzzQueue` in place

### Client — `host.$roomCode.tsx`

In `QuestionModal`, when `buzzedName` is set (phase `buzzed`), add a "Next Player" button beside the existing Correct / Incorrect / No Answer buttons:

- **Disabled + tooltip "No one buzzed yet"** when `buzzQueue` is empty
- **Enabled** when `buzzQueue.length > 0`
- On hover: show an ordered list of queued player display names (positions 1…n)
- On click: `send({ type: "next_player" })`

The tooltip/popover uses a plain CSS `title` attribute for simplicity on desktop; a small absolutely-positioned div on hover for styled rendering. Since the host view is desktop-primary (the host runs on a laptop/desktop), hover is acceptable here.

---

## Data flow

```
player buzzes (2nd)
  → server: append to buzzQueue
  → broadcast: buzz_queue_updated { queue: ["player2"] }
  → host client: game.buzzQueue = ["player2"]
  → UI: "Next Player" button becomes enabled, hover shows "1. Alice"

host clicks Next Player
  → send: { type: "next_player" }
  → server: pop queue, set currentPlayerId = "player2"
  → broadcast: buzzed { playerId: "player2" }
  → broadcast: buzz_queue_updated { queue: [] }
  → UI: buzzedName changes to "Alice", queue button disabled again
```

---

## Scope

- No changes to the player (`play.$roomCode`) view — the queue is host-only information
- No changes to Daily Double or Final Jeopardy flows — queue only applies to `buzz_open` / `buzzed` phases of normal questions
- `buzzQueue` resets to `[]` on every new question (alongside `lockedOutOnCurrent`)

---

## Testing

- Unit: `buzz` transition with pre-existing `currentPlayerId` appends to queue
- Unit: `next_player` intent pops queue, updates `currentPlayerId`, broadcasts correctly
- Unit: `next_player` on empty queue throws `GameError`
- Unit: same player cannot appear twice in queue
- Unit: locked-out player cannot enter queue
- Integration: full question flow — two players buzz, host marks first incorrect, clicks Next Player, judges second player
