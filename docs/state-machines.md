# State Machines

Authoritative state diagrams for stateful entities. The server owns
these state machines; clients render derived views.

## 1. Game lifecycle

Tracks `game.status`. One game per host at a time (FR-G6).

```mermaid
stateDiagram-v2
    [*] --> Lobby : host creates game
    Lobby --> Active : host starts (≥ 1 player)
    Lobby --> Aborted : host aborts
    Active --> Paused : host disconnects
    Paused --> Active : host reconnects (within 10 min)
    Paused --> Aborted : host gone > 10 min
    Active --> Completed : last question judged + (FJ done if enabled)
    Active --> Aborted : host aborts
    Completed --> [*]
    Aborted --> [*]
```

| State | Description | Realises |
| --- | --- | --- |
| `Lobby` | Players joining; not yet started. | FR-L1, FR-G1 |
| `Active` | Game in progress; per-question states (see §2) drive play. | FR-MG1+ |
| `Paused` | Host disconnected; no question state advances. | FR-R3 |
| `Completed` | All questions resolved; results visible. | FR-C1 |
| `Aborted` | Host abandoned or aborted; no results. | FR-G4, FR-R3 |

## 2. Per-question lifecycle (main round)

Tracks `game_question_state.state` for one selected question.

```mermaid
stateDiagram-v2
    [*] --> Unselected
    Unselected --> Open : host opens
    Open --> BuzzWindow : read delay elapsed (default 3s)
    BuzzWindow --> Buzzed : first valid buzz received
    BuzzWindow --> Closed : no buzz within window
    Buzzed --> Answering : auto, server-driven
    Answering --> Judged : host judges
    Judged --> BuzzWindow : incorrect/no-answer + players remain
    Judged --> Closed : correct OR all players exhausted OR host closes
    Closed --> [*]
```

Notes:
- An "early buzz" (during `Open` before `BuzzWindow`) does not change
  state but locks the offending player out for 0.5 s (FR-MG3). It is
  recorded in `game_event`.
- `Answering` is short-lived; the host hears the verbal answer and
  judges within the answer window.

## 3. Daily Double (alternate question lifecycle)

When the picked question has `is_daily_double = true`, the lifecycle
diverges:

```mermaid
stateDiagram-v2
    [*] --> Unselected
    Unselected --> Wagering : picked by player P
    Wagering --> Answering : P submits valid wager
    Wagering --> Closed : timeout (auto-min wager)
    Answering --> Judged : host judges
    Judged --> Closed
    Closed --> [*]
```

- Only player P can buzz/answer (FR-DD1).
- Wager bounds enforced server-side (FR-DD2).

## 4. Final Jeopardy lifecycle

Triggered after the main round completes if `options.final_enabled`.

```mermaid
stateDiagram-v2
    [*] --> CategoryReveal
    CategoryReveal --> WagerCollect : all eligible players notified
    WagerCollect --> ClueReveal : all wagers in OR 30s timeout
    ClueReveal --> AnswerCollect
    AnswerCollect --> Judging : all answers in OR 30s timeout
    Judging --> Done : host has judged each player
    Done --> [*]
```

Eligibility: players with `score > 0` (FR-FJ2). Ineligible players
remain spectating.

## 5. Player slot lifecycle

Tracks `game_player.status` for one player slot in one game.

```mermaid
stateDiagram-v2
    [*] --> Joined : player joins lobby
    Joined --> Disconnected : socket closed
    Disconnected --> Joined : reconnect within 5 min (FR-R1)
    Disconnected --> Left : timeout (>5 min)
    Joined --> Left : voluntary leave
    Joined --> Kicked : host kicks
    Left --> [*]
    Kicked --> [*]
```

Score is preserved across `Joined ↔ Disconnected`. A `Left` or
`Kicked` slot is not reusable in the same game.

## 6. Auth session lifecycle

Tracks `auth_session` rows.

```mermaid
stateDiagram-v2
    [*] --> Active : login or register success
    Active --> Active : request seen (sliding expiry)
    Active --> Expired : 30 days idle (FR-A5)
    Active --> Revoked : logout / password change / account delete
    Expired --> [*]
    Revoked --> [*]
```

## 7. Email verification token lifecycle

Tracks rows in `auth_verification` with `purpose = 'verify_email'`.
Same pattern applies to `'reset_password'` (1 h expiry, single use).

```mermaid
stateDiagram-v2
    [*] --> Pending : token issued
    Pending --> Used : user opens link, server validates
    Pending --> Expired : 24h (verify) / 1h (reset)
    Used --> [*]
    Expired --> [*]
```

## 8. Quiz lifecycle (informational)

Quizzes do not have a status column; their lifecycle is implicit.

```mermaid
stateDiagram-v2
    [*] --> Draft : created
    Draft --> Editing : owner opens editor
    Editing --> Saved : auto-save on blur
    Saved --> Editing : owner edits again
    Saved --> Deleted : owner deletes
    Saved --> Live : referenced by a Game in lobby/active
    Live --> Saved : game ends (referenced by completed/aborted games but editable again)
    Deleted --> [*]
```

Editing while `Live` is allowed (FR-Q9): the live game holds a
snapshot.
