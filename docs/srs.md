# Software Requirements Specification (SRS)

**Project**: JeopardyGame
**Version**: 1.0 (v1 scope)
**Status**: Draft

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements
for **JeopardyGame**, a realtime, web-based Jeopardy-style quiz game.
It is the authoritative requirements artifact for v1 development; all
sub-plans, designs, and implementations must trace back to a requirement
listed here.

### 1.2 Scope
JeopardyGame allows registered users to author quizzes, host live game
sessions, and play those sessions in real time with other participants.
The system consists of a single-page web application (`apps/web`) and a
backend API server (`apps/server`) backed by PostgreSQL.

### 1.3 Definitions
See [`glossary.md`](glossary.md) for full domain terminology. Short
versions used here:
- **Host** — the user who created a quiz and runs a game session of it.
- **Player** — a participant joining a game (registered or guest).
- **Quiz** — the authored content (categories + questions).
- **Game** — a live session running a quiz.
- **Room code** — short human-typeable code players use to join a game.

### 1.4 Document conventions
- Functional requirements are prefixed `FR-`.
- Non-functional requirements are prefixed `NFR-`.
- "MUST", "SHALL", "SHOULD", "MAY" follow [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## 2. Overall description

### 2.1 Product perspective
JeopardyGame is a self-contained web product. It does not integrate
with third-party LMS, classroom, or enterprise SSO systems in v1.

### 2.2 User classes
| Class | Description | Access |
| --- | --- | --- |
| Guest | Unauthenticated visitor | Browse public marketing pages, join games as a player using a room code and display name. |
| Registered user | Has an account | All of guest, plus authoring and hosting quizzes, persistent profile and game history. |
| Host | A registered user currently running a game session | Same as registered user, plus host controls in the active game. |
| System | Automated background processes | Email sending, session expiry, game timeouts. |

> **Assumption A1**: Guests MAY join a game without registering, but
> MUST provide a display name. Authoring and hosting require an
> account. To be confirmed by product owner.

### 2.3 Operating environment
- **Client**: Latest evergreen browsers (Chrome, Firefox, Safari, Edge)
  on desktop and mobile. No support for IE or browsers older than two
  years.
- **Server**: Linux container, deployed on Railway (production) or
  via `docker-compose` (development).
- **Database**: PostgreSQL 16+.
- **Storage**: Local filesystem mounted as a Docker / Railway volume.

### 2.4 Design and implementation constraints
See [`plan.md`](plan.md) for locked-in technology decisions. Summary:
- Bun monorepo, TypeScript strict.
- Backend: Elysia + Drizzle + pg.
- Frontend: React 19 + Vite + TanStack Router + Tailwind v4 + shadcn/ui.
- Auth: better-auth, HTTP-only session cookies.
- Realtime: WebSockets, server-authoritative.
- Mobile-first responsive design.

### 2.5 Assumptions and dependencies
- A1: Guest play allowed (see 2.2).
- A2: Maximum **6** concurrent players per game (classic Jeopardy is 3;
  6 accommodates casual party play).
- A3: A user may host **at most one** active game at a time.
- A4: Quiz visibility model is "private + share by link" — no public
  library, no forking.
- A5: Email delivery uses an external transactional provider in
  production (e.g. Resend); MailHog or console transport in development.

## 3. Functional requirements

### 3.1 Account & authentication

- **FR-A1** The system SHALL allow a guest to register an account
  with email and password.
- **FR-A2** The system SHALL require email verification before a user
  may host a game. Authoring quizzes is permitted before verification.
- **FR-A3** The system SHALL allow a registered user to log in with
  email and password.
- **FR-A4** The system SHALL store passwords using Argon2id; plaintext
  passwords MUST NEVER be persisted or logged.
- **FR-A5** The system SHALL maintain user sessions via HTTP-only,
  Secure, SameSite=Lax cookies. Sessions expire after **30 days** of
  inactivity.
- **FR-A6** The system SHALL allow a user to log out, invalidating the
  current session server-side.
- **FR-A7** The system SHALL allow a user to request a password reset
  via email. Reset links expire after **1 hour** and may be used once.
- **FR-A8** The system SHALL allow a logged-in user to change their
  password by providing the current password.
- **FR-A9** The system SHALL allow a logged-in user to delete their
  account. Deletion cascades: owned quizzes deleted, hosted game
  history anonymised, played-in game history anonymised.

### 3.2 Profile

- **FR-P1** The system SHALL provide a profile page for each user,
  showing display name, avatar (optional), join date, and a count of
  authored quizzes.
- **FR-P2** A profile owner SHALL be able to edit display name and
  avatar.
- **FR-P3** A visitor (logged in or not) SHALL see a read-only profile.
- **FR-P4** The owner profile view SHALL additionally display recent
  hosted games (last 10) and the user's quiz list (with edit access).

### 3.3 Quiz authoring

- **FR-Q1** A registered user SHALL be able to create a quiz with a
  title and optional description.
- **FR-Q2** A quiz SHALL contain **6** categories per round and **5**
  questions per category, matching standard Jeopardy structure.
- **FR-Q3** A quiz MAY include a **Final Jeopardy** question
  (single category + single question + correct answer).
- **FR-Q4** A quiz MAY include **Daily Double** flags on up to **2**
  questions in the main round.
- **FR-Q5** Each question SHALL have: a clue (text), a correct
  response, a point value, and optional media attachments
  (image and/or audio).
- **FR-Q6** A user SHALL be able to edit and delete their own
  quizzes. Other users MUST NOT be able to modify them.
- **FR-Q7** A user SHALL be able to view a list of all quizzes they
  own ("My Quizzes"), most recently edited first.
- **FR-Q8** A quiz SHALL have a **share link** (unguessable URL token)
  that allows a viewer to preview the quiz metadata (title only — not
  questions or answers) and join a hosted session of it. To be
  refined: see Open Questions.
- **FR-Q9** Editing a quiz that has historic completed games SHALL
  NOT modify those historical records (snapshot per game; see FR-G2).

### 3.4 Media

- **FR-M1** The system SHALL accept image uploads in formats
  PNG, JPEG, WebP, GIF, max **5 MB** per file.
- **FR-M2** The system SHALL accept audio uploads in formats
  MP3, OGG, WAV, max **10 MB** per file, max **30 seconds** duration.
- **FR-M3** The system SHALL store media via a `Storage` interface
  (see [`plan.md`](plan.md)). The current backend writes to local
  disk inside a persistent Docker volume.
- **FR-M4** The system SHALL serve media files via authenticated URLs
  scoped to the owning user OR participants of a game using that
  media.
- **FR-M5** Deleted quizzes SHALL trigger garbage collection of media
  no longer referenced by any quiz, after a **24-hour** grace period.

### 3.5 Game hosting

- **FR-G1** A registered, email-verified user SHALL be able to start
  a new game from one of their quizzes. The system SHALL allocate a
  unique 6-character room code (alphabet `BCDFGHJKLMNPQRSTVWXYZ` to
  avoid ambiguous characters and accidentally-spelled words).
- **FR-G2** Starting a game SHALL snapshot the quiz: subsequent edits
  to the quiz MUST NOT affect the in-flight or completed game.
- **FR-G3** The host SHALL be able to set per-game options before
  start: enable/disable Final Jeopardy, custom timer duration
  (default **8 seconds** for buzz window, **30 seconds** for answer).
- **FR-G4** The host SHALL be able to abort a game from any state,
  marking it `aborted`.
- **FR-G5** The host SHALL be the only client able to invoke control
  actions: open question, judge answer, advance to next, reveal
  Final Jeopardy.
- **FR-G6** A user MUST NOT have more than one game in `active` or
  `lobby` state at the same time (Assumption A3).

### 3.6 Joining a game

- **FR-J1** A guest or registered user SHALL be able to join a game
  by entering its room code on the "Join" page.
- **FR-J2** A joining user SHALL provide a display name. For
  registered users, their account display name is pre-filled and
  editable per game.
- **FR-J3** The system SHALL reject joins if the game is `aborted`,
  `completed`, or already at the player cap (A2).
- **FR-J4** A user MAY reconnect to a game they previously joined
  using the same browser session. The system SHALL restore their
  player slot, score, and current view.

### 3.7 Game lobby

- **FR-L1** The lobby view SHALL show the room code prominently and
  the current list of joined players in real time.
- **FR-L2** The host SHALL be able to remove a player from the lobby.
- **FR-L3** A player SHALL be able to leave the lobby voluntarily.
- **FR-L4** The host SHALL be able to start the game when at least
  **1** player has joined. (This permits solo play for testing/demo;
  product may revise.)

### 3.8 Gameplay — main round

- **FR-MG1** When a question is selected and opened by the host, the
  clue (and any media) SHALL be displayed simultaneously to all
  participants.
- **FR-MG2** After a configurable delay (default **3 seconds** to
  finish reading), the buzz window SHALL open. The first valid buzz
  wins, determined by the **server's** receive timestamp.
- **FR-MG3** A player SHALL NOT be able to buzz before the buzz
  window opens; doing so locks them out of buzzing on this question
  for **0.5 seconds** (early-buzz penalty).
- **FR-MG4** A buzzed-in player has the configured answer window
  (default 8s) to respond. Their response is captured by the host
  verbally and judged by the host (correct / incorrect / no answer).
- **FR-MG5** Correct answers SHALL credit the question's point value
  to the player's score; incorrect answers SHALL deduct the same
  amount. "No answer" SHALL not change the score.
- **FR-MG6** After an incorrect or no-answer judgement, the system
  SHALL re-open the buzz window for remaining players (those not yet
  buzzed on this question).
- **FR-MG7** A question is **closed** when (a) it is answered
  correctly, (b) all players have been judged, or (c) the host
  manually closes it.
- **FR-MG8** Closed questions SHALL be marked unselectable on the
  board.
- **FR-MG9** The board SHALL display each player's current score
  continuously.

### 3.9 Daily Double

- **FR-DD1** When the picking player selects a Daily Double question,
  only that player SHALL be permitted to answer.
- **FR-DD2** Before the clue is shown, the picking player SHALL
  declare a wager between **5** points and the larger of their
  current score or the maximum point value remaining on the board.
- **FR-DD3** A correct response SHALL credit the wager; an incorrect
  or no-answer response SHALL deduct the wager.

### 3.10 Final Jeopardy (optional)

- **FR-FJ1** When the main round ends and Final Jeopardy is enabled,
  the system SHALL reveal only the **category** to all players.
- **FR-FJ2** Each player SHALL submit a hidden wager (0 ≤ wager ≤
  current score) within **30 seconds**. Players with non-positive
  scores skip Final Jeopardy.
- **FR-FJ3** After all wagers are in (or the timer elapses), the
  clue SHALL be revealed and players SHALL submit their written
  responses within **30 seconds**.
- **FR-FJ4** The host SHALL judge each response in turn; scoring
  applies the wager.

### 3.11 Game completion

- **FR-C1** When the main round (and Final Jeopardy, if enabled) ends,
  the system SHALL display a results screen with final ranking,
  scores, and a shareable summary URL.
- **FR-C2** Game results SHALL be persisted and visible from the
  host's profile and from each registered participant's profile.

### 3.12 Reconnection & resilience

- **FR-R1** A client that disconnects MAY rejoin within **5 minutes**
  of the disconnect; after that, the player slot SHALL be released
  if the host has not paused the game.
- **FR-R2** On reconnect, the server SHALL push a full state
  snapshot to the rejoining client.
- **FR-R3** If the host disconnects, the game SHALL be paused.
  Players see a "host reconnecting" state. If the host does not
  return within **10 minutes**, the game SHALL be marked `aborted`.

### 3.13 Notifications & email

- **FR-E1** The system SHALL send a verification email upon
  registration.
- **FR-E2** The system SHALL send a password-reset email on request.
- **FR-E3** The system SHALL NOT send marketing email. No email
  preferences UI is required for v1.

## 4. Non-functional requirements

### 4.1 Performance
- **NFR-P1** End-to-end buzz latency (player click → host UI shows
  buzzer fired) SHALL be ≤ **150 ms** at the 95th percentile on a
  typical broadband connection (≤ 50 ms RTT).
- **NFR-P2** Initial page load (cold cache) on a mid-range mobile
  device over 4G SHALL render the homepage within **2 seconds**.
- **NFR-P3** The server SHALL support at least **50** concurrent
  active games at v1 launch.

### 4.2 Security
- **NFR-S1** All HTTP traffic SHALL be served over TLS in production.
- **NFR-S2** Session cookies SHALL be `HttpOnly`, `Secure`, and
  `SameSite=Lax`.
- **NFR-S3** Authorization SHALL be enforced server-side on every
  endpoint and WebSocket message; client checks are advisory only.
- **NFR-S4** User-supplied content SHALL be sanitised against XSS in
  every render context (clues, display names, quiz titles).
- **NFR-S5** Rate limiting SHALL apply to: login (5 / minute / IP),
  registration (3 / hour / IP), password reset (3 / hour / email),
  media upload (10 / minute / user).
- **NFR-S6** Media uploads SHALL be content-sniffed (magic bytes), not
  trusted by extension or `Content-Type` header.
- **NFR-S7** Room codes SHALL be cryptographically random within their
  alphabet to prevent guessing.

### 4.3 Availability & reliability
- **NFR-A1** The system SHALL target **99.5%** monthly availability
  (≈ 3.6 h downtime/month).
- **NFR-A2** Postgres data SHALL be backed up daily with at least
  7-day retention in production.
- **NFR-A3** Loss of a server instance MUST NOT corrupt persisted
  game state. In-flight game state in memory MAY be lost; the system
  SHOULD attempt to recover from `game_events` (see ERD).

### 4.4 Usability & accessibility
- **NFR-U1** The UI SHALL be mobile-first; player view MUST be fully
  usable in portrait orientation on a 375×667 viewport.
- **NFR-U2** Interactive controls SHALL meet WCAG 2.1 AA contrast
  ratios.
- **NFR-U3** All actions SHALL be operable via keyboard alone (no
  pointer-only affordances).
- **NFR-U4** The buzz button SHALL have a touch target of at least
  64×64 CSS px.

### 4.5 Internationalisation
- **NFR-I1** v1 SHALL ship in English only. The codebase SHOULD avoid
  hard-coding user-facing strings in components (single source for
  copy) to ease later i18n; this is a SHOULD, not a blocker.

### 4.6 Maintainability
- **NFR-M1** All code SHALL pass `bun run lint` (Biome) before merge.
- **NFR-M2** TypeScript strict mode SHALL remain enabled across all
  packages.
- **NFR-M3** Public API contracts (REST + WS) SHALL be documented in
  [`api.md`](api.md) and kept in sync with the implementation.
- **NFR-M4** Database schema changes SHALL be versioned via
  `drizzle-kit` migrations; no ad-hoc schema changes in production.

### 4.7 Privacy & legal
- **NFR-L1** The system SHALL collect only data necessary to operate
  the service (email, password hash, display name, gameplay records).
- **NFR-L2** Account deletion SHALL be honoured within **30 days** and
  SHALL anonymise rather than retain identifying data in historical
  game records.

## 5. Out of scope (v1)
The following are explicitly excluded from v1 and not subject to the
above requirements:
- Public quiz library, search, fork, rating.
- Spectator mode.
- Tournaments, brackets, ladders.
- Native mobile apps.
- SSO / OAuth providers (Google, GitHub, etc.).
- AI-generated quizzes.
- Live video / voice chat.
- Multi-language support.

## 6. Open questions
The following questions are unresolved and tracked for sub-plans:
- **OQ-1** (re A1) Anonymous join without account — confirm.
- **OQ-2** Email transport in dev (MailHog vs console).
- **OQ-3** Score persistence: per-game only, or aggregate stats on
  profile?
- **OQ-4** Should share-link viewers see the question count / categories,
  or only the title?

## 7. Traceability
Each FR/NFR will be referenced from:
- [`use-cases.md`](use-cases.md) — actor flows
- [`api.md`](api.md) — endpoint mapping
- [`erd.md`](erd.md) — data model coverage
- Implementation tickets / commits (once development starts)
