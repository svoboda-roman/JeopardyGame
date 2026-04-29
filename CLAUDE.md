# CLAUDE.md

Guidance for AI coding assistants working in this repo. Read
`docs/architecture.md` for the stack and `docs/plan.md` for the roadmap
before suggesting any non-trivial change.

## What this is

A realtime, web-based Jeopardy clone. A host authors a quiz, opens a
lobby, and players join via a short room code. Buzzers, scoring, and
live state are server-authoritative over WebSockets.

## Repo layout

```
apps/
  server/   Elysia + Drizzle + pg (HTTP + WebSocket API)
  web/      React 19 + Vite + TanStack Router + Tailwind v4 + shadcn/ui
docs/       architecture.md (stack), plan.md (master plan)
biome.json  repo-wide lint + format
```

Bun workspaces. **Single lockfile** at the root — never commit
`bun.lock` inside an app folder. Repo-wide tooling (biome, typescript)
lives in the root `package.json`; runtime deps go in the app that uses
them.

## Type flow (do not break)

```
Drizzle schema → Elysia handlers → export type App → treaty<App>() in web
```

The web app imports `App` *as a type* from the server workspace. No
codegen, no manual duplication. If you add a server route, its types
should be reachable from the client without any extra step.

## Locked-in decisions (see docs/plan.md for context)

- **Auth**: `better-auth` with HTTP-only session cookies. No JWT, no
  tokens in localStorage.
- **State on web**: TanStack Query for HTTP, Zustand for live game
  state pushed over WS. Don't reach for Redux / Jotai / Context for
  game state.
- **Validation**: Elysia `t` schemas at every route boundary. Trust
  nothing from the client.
- **Game state**: server-authoritative state machine
  (`LOBBY → QUESTION_OPEN → BUZZED → ANSWERING → JUDGED → ...`). The
  client never drives transitions.
- **Buzz timing**: server stamps buzz timestamps. Never trust a
  client-sent timestamp.
- **No SSR.** The web app is a pure SPA. Don't add Next, TanStack
  Start, or `@tanstack/react-router-ssr-query` back in.
- **Mobile-first.** Style with unprefixed (mobile) classes first;
  `sm:` / `md:` / `lg:` to scale up. Player view is the critical
  surface — no hover-only affordances, large buzz target.
- **Quiz visibility**: private + share by link. There is no public
  browse / library / fork.
- **Media storage**: abstract `Storage` interface in the server.
  Current backend is local disk in a Docker volume; an S3-compatible
  backend is planned. Always go through the interface.
- **Icons**: `@hugeicons/react` only. `lucide-react` is being removed —
  do not import from it.

## Commands

From the repo root:

```bash
bun install            # install all workspaces
bun run lint           # biome check
bun run format         # biome check --write
```

Per-app:

```bash
cd apps/web && bun dev       # Vite on :3000
cd apps/server && bun dev    # (script TBD)
```

## Conventions

- **Don't commit generated files**: `routeTree.gen.ts`, `node_modules/`,
  build output, drizzle migration journal artifacts not meant for VCS.
- **Don't add a `tailwind.config.*`** — Tailwind v4 is configured via
  CSS tokens in `apps/web/src/styles.css`.
- **Path aliases** in `apps/web`: `#/*` and `@/*` both map to `src/*`.
- **shadcn components** live under `apps/web/src/components/ui/`. When
  adding one, swap any `lucide-react` import for `@hugeicons/react`.
- **Reconnection is a feature**, not an edge case. WS handlers must
  send a full snapshot on connect so a client can rejoin mid-game.

## When making changes

1. Check `docs/plan.md` to see if the work has a sub-plan or fits a
   planned slice. If it doesn't, ask before inventing scope.
2. Prefer editing existing files over creating new ones.
3. Don't add SSR, framework switches, or auth swaps without explicit
   approval — those are load-bearing decisions in the plan.
4. Keep the type flow intact: never copy a server type into the web
   app by hand.
