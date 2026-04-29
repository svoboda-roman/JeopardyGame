# Glossary

Domain and technical terms used throughout the JeopardyGame docs.
Definitions here are authoritative — if another document seems to use a
term differently, that document is wrong.

## Game-domain terms

- **Quiz** — Authored content: a set of categories and questions,
  optionally with a Final Jeopardy. Owned by one user. See
  [`erd.md`](erd.md) `QUIZ`.
- **Category** — A column on the board, holding 5 questions of
  ascending point value. Belongs to a quiz.
- **Question** — A single clue + correct response + point value, with
  optional media. Belongs to a category.
- **Final Jeopardy** *(optional per quiz)* — A single bonus question
  played after the main round. Each player wagers privately, then all
  reveal answers simultaneously.
- **Daily Double** — A flag on up to 2 questions per quiz. When picked,
  only the picking player can answer, after wagering between min (5)
  and a per-rule maximum.
- **Game** — A live session of a quiz. Identified by a UUID and a
  user-facing room code.
- **Room code** — Six-character code from a curated alphabet
  (`BCDFGHJKLMNPQRSTVWXYZ`) that players type to join a game. Avoids
  ambiguous letters and accidentally-spelled words.
- **Lobby** — The pre-game state of a game; players join here, host
  starts when ready.
- **Host** — The user who created the game from their quiz and runs the
  controls. Always also the owner of the underlying quiz.
- **Player** — A participant in a game (registered or guest), other
  than (or including) the host.
- **Guest** — A participant who is not logged in. Identified per game
  by a `guest_token` cookie.
- **Buzz window** — The time after a question is opened during which
  players may press the buzzer. Opens after the **read delay**.
- **Read delay** — The pause after a question is shown before the buzz
  window opens; gives players time to read the clue. Default 3 s.
- **Early buzz** — A buzz received during the read delay. Locked out
  for 0.5 s (FR-MG3).
- **Answer window** — Time the buzzed-in player has to give a verbal
  answer before the host judges them. Default 8 s.
- **Verdict** — The host's judgement of a player's answer:
  `correct`, `incorrect`, or `no_answer`.
- **Wager** — An amount bet by a player on a Daily Double or Final
  Jeopardy question.
- **Picker** — The player whose turn it is to choose the next question
  on the board (default: most recent correct answerer; first picker is
  selected by the host or randomised).
- **Snapshot** *(quiz)* — The frozen copy of a quiz stored on a game
  when it starts. Subsequent edits to the source quiz do not change
  in-flight or completed games (FR-G2).
- **Snapshot** *(WebSocket)* — The full game state pushed by the
  server to a client on (re)connect. Subsequent updates are deltas.
- **Reconnection** — Resuming an existing player slot after a dropped
  connection, within 5 minutes (FR-R1).
- **Final scoreboard** — The post-game results page showing ranking
  and final scores, with a shareable URL.

## Identity & auth terms

- **Account** — A `auth_user` row with email + password hash and
  associated `user_profile`.
- **Session** — A server-side `auth_session` row; the client carries
  only an opaque session cookie. Idle timeout 30 days.
- **Verified** — An account with `email_verified = true`. Required to
  host a game (FR-A2).
- **Verification token** — A signed one-time token sent by email for
  proving control of the address (or for password reset).
- **Argon2id** — The password-hashing algorithm used by better-auth.

## Architecture terms

- **Workspace** — A bun workspace under `apps/*`. Each has its own
  `package.json` and runtime deps.
- **Eden treaty** — The type-safe HTTP/WS client provided by
  `@elysiajs/eden`. Imports the `App` type from the server to give
  the web app fully-typed calls without codegen.
- **State machine (game)** — The server-authoritative finite state
  machine that drives a game's lifecycle and per-question states.
  See [`state-machines.md`](state-machines.md).
- **Storage interface** — The abstraction in
  `apps/server/src/storage/` over media file persistence. Local-disk
  in v1; S3-compatible later (FR-M3).
- **Snapshot store** — In-memory mirror of the active game's state on
  the server, used for the WS snapshot reply on connect.
- **Share link** — An unguessable URL token (`/share/:token`) that
  exposes a quiz's title (and minimal metadata) to anyone with the
  link, so they can be invited to a hosted session of it.
- **GC (garbage collection) of media** — Nightly job that removes
  uploaded files no longer referenced by any quiz (FR-M5).

## Process / methodology terms

- **SRS** — Software Requirements Specification, [`srs.md`](srs.md).
- **FR-x / NFR-x** — Numbered functional / non-functional requirements
  defined in the SRS. Used as cross-references throughout the docs.
- **UC-xx** — Use case identifier from [`use-cases.md`](use-cases.md).
- **OQ-x** — Open question tracked in the relevant doc; intended to be
  resolved before the affected slice is built.
- **Sub-plan** — A focused implementation plan for one slice or
  cross-cutting piece (auth, schema, WS protocol, etc.). Will live in
  `docs/plans/<topic>.md` once authored.
- **Slice** — A vertical, end-to-end increment that touches DB → API →
  client and produces a demo-able outcome. The build order in
  [`plan.md`](plan.md) is by slice, not by horizontal layer.
