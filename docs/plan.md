# JeopardyGame — Master Plan

> This is the high-level project plan. Sub-plans (auth, schema, game protocol,
> per-page work) will be created separately and reference back here. On
> execution this file should be mirrored to `docs/plan.md` (or split per
> section into `docs/`).

## Context

JeopardyGame is a realtime, web-based clone of the Jeopardy game show. A user
("host") authors a quiz, opens a lobby, and other users ("players") join via
a short room code. The host runs the board; players buzz in, answer, and
score. The repo is a fresh bun monorepo with the runtime stack already
scaffolded — this plan defines what to build on top of it.

The point of writing this now is to lock in the major decisions (auth model,
quiz visibility, media support, realtime architecture) before we start
slicing work, so that sub-plans don't drift.

## Decisions locked in

| Area | Choice |
| --- | --- |
| Auth | **better-auth** with **HTTP-only session cookies** (email/password, password reset, email verification) |
| UX target | **Mobile-first.** Player view designed for phones; host/editor scale up to desktop. |
| Quiz visibility | **Private by default + share by link**. No public browse/library. |
| Media in v1 | **Images and audio supported from v1.** |
| Media storage | **Local disk in a Docker volume.** Later: Railway persistent volume. Storage layer must be abstracted so swapping to S3/R2 is a one-file change. |
| Realtime client state | **Zustand** for live game state pushed over WebSocket. **TanStack Query** for HTTP request/response. |
| Spectator mode | **Deferred** to post-v1. |

## Architecture summary (already in place)

- **Repo**: bun workspaces. `apps/server` (Elysia + Drizzle + pg),
  `apps/web` (Vite + React 19 + TanStack Router + Tailwind v4 + shadcn/ui).
- **Tooling**: Biome, TypeScript strict, single root `bun.lock`.
- **Type flow**: Drizzle schema → Elysia handlers → `export type App` →
  `treaty<App>()` (Eden) in web. No codegen.
- See `docs/architecture.md` for the full layout.

## Scope of v1

### Pages

Player/auth surface:
- Homepage (marketing + "Join with code" entry)
- Login
- Register
- Forgot password / reset password
- Verify email (landing for the verification link)
- Profile (owner view)
- Profile (visitor view)
- Settings (change password, delete account)
- 404 / generic error

Quiz authoring:
- "My quizzes" — list of the current user's quizzes + "Create new" button
- Quiz creator
- Quiz editor (separate from creator; editing an existing one)

Game flow:
- Join game (enter room code) — also reachable from the homepage CTA
- Waiting lobby (host view)
- Waiting lobby (player view)
- Game board (host view) — controls, scoring, "next question"
- Game board (player view) — buzzer, score
- Final scoreboard / results

### Out of scope for v1
- Public quiz browse / library / forking
- Spectator mode
- Mobile native apps (PWA-ish web only)
- Tournaments, brackets, multi-round leagues

## Cross-cutting tech to set up before pages

These are the load-bearing pieces. Each gets its own sub-plan.

1. **Auth (sub-plan)** — Wire better-auth into Elysia, add Drizzle adapter,
   set up sessions stored as **HTTP-only, SameSite=Lax, Secure** cookies
   (no JWT, no localStorage tokens). Password hashing (Argon2 via
   better-auth defaults), email verification, password reset. Decide email
   transport (Resend / SMTP / dev console). CORS + `credentials: 'include'`
   on the Eden client. Expose `auth` middleware for protected Elysia
   routes; expose user state to web via a `/me` endpoint and a Zustand
   `auth` slice.

2. **Database schema (sub-plan)** — Drizzle tables: `users` (better-auth
   owns most of this), `quizzes`, `categories`, `questions` (incl. media
   refs, point value, daily-double flag), `media` (file metadata), `games`
   (room code, host, status, current question), `game_players`
   (membership + score), `game_events` (audit/replay log). Migrations via
   `drizzle-kit generate`. Seeded dev data.

3. **Media pipeline (sub-plan)** — Abstract `Storage` interface in the
   server with two implementations: `LocalDiskStorage` (current) and a
   stub for `S3CompatibleStorage` (future). Upload endpoint that writes to
   the configured backend, returns a stable key. Static-serving route for
   local disk. Validation: mime types, max size, audio duration cap.
   Docker compose: mount `./uploads` as a volume so media survives
   container rebuilds.

4. **Realtime / WS protocol (sub-plan)** — Single Elysia WS endpoint per
   game room. Server-authoritative state machine:
   `LOBBY → QUESTION_OPEN → BUZZED → ANSWERING → JUDGED → (next | END)`.
   Server stamps buzz timestamps; first valid buzz wins. Reconnection:
   on connect, server sends current full state snapshot; subsequent
   updates are deltas. Eden treaty's WS support for typed messages.
   Client side: a `useGameSocket(roomCode)` hook that hydrates a Zustand
   store and exposes typed `send(...)` actions.

5. **Validation** — Use Elysia's `t` schemas at every route boundary.
   Share types (not runtime schemas) with web via Eden.

6. **Forms** — TanStack Form for all input-heavy pages (login, register,
   quiz editor, settings). Pairs naturally with TanStack Router.

7. **Routing & layouts (sub-plan)** — TanStack Router file routes:
   `__root` → app shell, `_auth` layout (redirects to login if no session)
   for protected pages, `_unauth` layout for login/register, in-game
   routes under `/play/$roomCode`.

8. **Theming / icons / responsive** — Tailwind v4 tokens via shadcn
   (already wired with tweakcn preset `b6sCXmnxJY`). Icons:
   `@hugeicons/react` only — remove `lucide-react` from `apps/web`.
   **Mobile-first**: every page styled with the unprefixed (mobile)
   classes first, `sm:` / `md:` / `lg:` to scale up. Player game view is
   the key surface — large buzz target, no hover-only affordances, safe
   for one-handed portrait use. Host view assumes a larger screen but
   should not break on tablet.

9. **Docker (sub-plan)** — `docker-compose.yml` with `postgres`, `server`,
   `web` (build → static), and a Caddy/nginx in front for static + WS.
   Persistent volume for `uploads/` and Postgres data. Production target
   is Railway; the compose file is the dev parity story.

## Suggested build order (vertical slices, not horizontal)

1. **Foundation**: Postgres in docker-compose, Drizzle baseline (`users`,
   `quizzes`, `questions`), better-auth login/register, `/me` endpoint,
   `_auth` route guard. End of slice: a logged-in user can hit a
   protected page.
2. **Quiz CRUD**: minimal quiz editor (no media), "My quizzes" list,
   share-by-link route. End of slice: a user can create a text-only quiz
   and the URL works.
3. **Realtime spike**: WS protocol + game state machine for ONE question.
   Host opens lobby, one player joins, buzzer works, score increments.
   Reconnection works. End of slice: end-to-end round.
4. **Full game loop**: full board, scoring, daily double, final round,
   end screen.
5. **Media**: image + audio upload, storage abstraction, embedding in
   questions, playback in game.
6. **Polish**: profile pages, settings, password reset, email verification,
   error pages, mobile player view.

The first three slices prove the hardest design decisions are right. If
realtime turns out painful, we'd rather discover it before building
profile pages.

## Open questions to resolve in sub-plans (not now)

- Email transport in dev vs prod (Resend, SMTP, MailHog?).
- Daily Double / Final Jeopardy mechanics exactly — wager UX.
- How many players per game (cap?). Default Jeopardy is 3.
- Score persistence: per-game only, or aggregated to user profile?
- Anonymous join (guest player without account) or login required?

## Critical files (for execution later)

- `apps/server/package.json` — add `better-auth`, storage deps, etc.
- `apps/server/src/index.ts` — Elysia app entry (does not exist yet).
- `apps/server/src/db/schema.ts` — Drizzle schema (does not exist yet).
- `apps/server/src/auth.ts` — better-auth config.
- `apps/server/src/storage/index.ts` — Storage interface.
- `apps/server/src/game/state.ts` — game state machine.
- `apps/web/src/lib/api.ts` — Eden treaty client.
- `apps/web/src/stores/game.ts` — Zustand game state store.
- `apps/web/src/routes/_auth.tsx`, `_unauth.tsx` — layout guards.
- `docker-compose.yml` — local stack (does not exist yet).
- `docs/architecture.md` — already exists; update as sub-plans land.

## Verification (per slice)

Each slice should end with a manual test in the browser plus a small
script:
- Slice 1: `curl` `/me` with and without a session cookie.
- Slice 2: create quiz via UI, hit share link in incognito.
- Slice 3: open host view in one browser, player view in another, run
  one buzz cycle, kill the player tab and reopen — state should restore.
- Slice 4: full game with 2 players from start to final scoreboard.
- Slice 5: upload an image and an audio file, see them in a question, hear
  audio play during gameplay.

Automated tests come later — Vitest is installed but no setup is in place.
That's a sub-plan of its own once the schema is stable.
