# JeopardyGame

A realtime, web-based Jeopardy clone. One user hosts a quiz, others join
via a short room code, buzz in, and compete on a live board.

> Status: early development. Stack is scaffolded; gameplay is not yet
> implemented. See [`docs/plan.md`](docs/plan.md) for the roadmap.

## Stack

- **Backend**: [Bun](https://bun.sh/) + [Elysia](https://elysiajs.com/)
  (HTTP + WebSockets) + [Drizzle ORM](https://orm.drizzle.team/) +
  PostgreSQL.
- **Frontend**: React 19 + [Vite](https://vitejs.dev/) +
  [TanStack Router](https://tanstack.com/router) +
  [Tailwind v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/).
- **Auth**: [better-auth](https://www.better-auth.com/) with HTTP-only
  session cookies.
- **Tooling**: [Biome](https://biomejs.dev/) + TypeScript strict.
  Bun workspaces, single root lockfile.

End-to-end type safety: Drizzle schema → Elysia handlers → Eden treaty
client. No codegen.

Full architecture lives in [`docs/architecture.md`](docs/architecture.md).

## Layout

```
apps/
  server/   API (Elysia + Drizzle)
  web/      SPA (React + TanStack Router)
docs/       Architecture and plans
```

## Getting started

Requires [Bun](https://bun.sh/) (and PostgreSQL once the backend lands).

```bash
bun install                          # install all workspaces

cd apps/web && bun dev               # Vite dev server on :3000
cd apps/server && bun dev            # (script TBD)
```

Repo-wide commands from the root:

```bash
bun run lint                         # biome check
bun run format                       # biome check --write
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — directory layout,
  tech stack, type flow.
- [`docs/plan.md`](docs/plan.md) — master plan: scope, locked-in
  decisions, build order.
- [`CLAUDE.md`](CLAUDE.md) — guidance for AI coding assistants.

## License

See [`LICENSE`](LICENSE).
