# Sub-plan 01 — Foundation

> First implementation slice from [`../plan.md`](../plan.md). End of
> slice: a logged-in, optionally email-verified user can hit a
> protected page. No quiz, no game logic yet — just identity, the
> database, and the route guard story.

## Context

Everything depends on auth + a working DB connection. This slice
delivers both, plus the Docker-based dev environment so subsequent
slices have parity. It also resolves the open questions from
[`../srs.md`](../srs.md) §6 that block any auth work.

## Decisions made for this slice

| Open question (in SRS) | Decision | Reason |
| --- | --- | --- |
| **OQ-1** Anonymous join | **Yes**, guests may join games (no account needed). Authoring/hosting still requires an account. | Lowers friction for party play (the primary use case). The cost — `guest_token` cookie + nullable `user_id` on `game_player` — is already in the ERD. |
| **OQ-2** Email transport | **MailHog** in dev (compose-managed; catches all email at `:8025`). **Resend** in prod via API key. | MailHog avoids accidental real sends in dev; Resend has a generous free tier and minimal config. Easy to swap later. |
| Email transport abstraction | A thin `Mailer` interface in the server with two implementations: `SmtpMailer` (MailHog) and `ResendMailer`. Selected by `MAILER` env var. | Same pattern as `Storage` — keeps the boundary swappable. |
| Score persistence | **Per-game only.** No aggregate stats on profile in v1. | Out of scope for v1 (NFR-L1). Add in a later slice if requested. |
| Drizzle / better-auth schema | Use better-auth's official `drizzle-adapter` so the `auth_*` tables are owned by the library. Add `user_profile` (1:1 with `auth_user`) for app-specific fields. | Matches the ERD and avoids hand-rolling identity tables. |

## Deliverables

By end of slice:

1. `docker-compose.yml` boots Postgres + MailHog. Volumes persist
   between restarts.
2. `apps/server` has a working Elysia app exposing:
   - `/health` — returns `{ ok: true }`.
   - better-auth routes mounted at `/auth/*` (sign-up, sign-in,
     sign-out, verify-email, forgot/reset password, change password).
   - `/me` — returns the current user + profile, or 401 if no session.
3. Drizzle schema in `apps/server/src/db/schema.ts` covering
   `auth_user`, `auth_session`, `auth_verification`, `user_profile`.
   Migration generated and applied.
4. better-auth configured with cookie sessions, Argon2id, email +
   password, email verification on sign-up, password reset, all per
   [`../srs.md`](../srs.md) FR-A1–FR-A8.
5. Verification + reset emails actually sent (caught by MailHog in
   dev).
6. `apps/web` updated:
   - Eden treaty client at `src/lib/api.ts` typed against `App`.
   - Zustand `authStore` with `useAuth()` hook (loads `/me` on mount).
   - `_auth` and `_unauth` layout guards in `src/routes/`.
   - Pages: `/login`, `/register`, `/forgot`, `/reset`, `/verify`,
     `/me` (placeholder profile), `/settings` (placeholder).
7. CORS + cookies work end-to-end across `localhost:5173`
   (Vite) and `localhost:3000` (server) in dev.

Out of scope for this slice: quizzes, games, media, Final Jeopardy,
profile editing, avatar upload, account deletion (still create the
endpoint scaffolding, but don't implement the cascade — that's slice
2 once quizzes exist).

## Critical files (will be created or modified)

### Repo-level
- `docker-compose.yml` *(new)* — `postgres:16`, `mailhog`, named
  volumes.
- `.env.example` *(new)* — documents required env vars.
- `.gitignore` — add `.env`, `pgdata/`, `uploads/` (if not already).

### `apps/server`
- `package.json` — add: `better-auth`, `@better-auth/drizzle-adapter`,
  `nodemailer` (for SMTP/MailHog), `resend` (for prod), `argon2`
  (better-auth uses it via `node:crypto` by default — confirm during
  install). Remove unused `tsx` if present.
- `src/index.ts` *(new)* — Elysia app entry. Mounts `/auth/*`,
  `/health`, `/me`. `export type App = typeof app`.
- `src/env.ts` *(new)* — Zod-ish env parsing (or Elysia's `t`) for
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `WEB_ORIGIN`, `MAILER` (`smtp|resend`), SMTP/Resend creds.
- `src/db/client.ts` *(new)* — pg pool + `drizzle()` instance.
- `src/db/schema.ts` *(new)* — auth + profile tables.
- `src/auth.ts` *(new)* — better-auth config (drizzle adapter, cookie
  options, email/password with verification + reset, mailer hook).
- `src/mailer/index.ts` *(new)* — `Mailer` interface + factory.
- `src/mailer/smtp.ts` *(new)* — MailHog/SMTP impl.
- `src/mailer/resend.ts` *(new)* — Resend impl.
- `src/routes/me.ts` *(new)* — `/me` endpoint (Elysia plugin).
- `drizzle.config.ts` *(new)* — points drizzle-kit at schema + DB url.
- Add scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:studio`.

### `apps/web`
- `src/lib/api.ts` *(new)* — `treaty<App>(env.API_URL,
  { fetch: { credentials: 'include' } })`.
- `src/stores/auth.ts` *(new)* — Zustand auth slice.
- `src/lib/queryClient.ts` *(new)* — TanStack Query client + provider.
- `src/main.tsx` — wrap router in `<QueryClientProvider>`.
- `src/routes/_unauth.tsx` *(new)* — layout, `beforeLoad` redirects
  if logged in.
- `src/routes/_auth.tsx` *(new)* — layout, `beforeLoad` redirects to
  `/login?next=...` if no session.
- `src/routes/_unauth/login.tsx`, `register.tsx`, `forgot.tsx`,
  `reset.tsx`, `verify.tsx` *(new)*.
- `src/routes/_auth/me.tsx`, `settings.tsx` *(new, placeholder UI)*.
- `package.json` — add `zustand`, `@tanstack/react-query`,
  `@tanstack/react-form`. Confirm `lucide-react` is removed.

### Workspace
- `apps/web/package.json` — add `"server": "workspace:*"` so the type
  import works.

## Step-by-step

1. **Compose stack**
   - Write `docker-compose.yml` with `postgres:16` (named volume
     `pgdata`, env `POSTGRES_USER/PASSWORD/DB`) and `mailhog/mailhog`
     (ports `1025` SMTP, `8025` UI).
   - Add `.env.example`, `.env` (gitignored).
   - `docker compose up -d` → confirm Postgres reachable, MailHog UI
     loads.

2. **Drizzle baseline**
   - Install `drizzle-orm`, `drizzle-kit`, `pg` (already present).
   - Add `drizzle.config.ts`.
   - Write `src/db/schema.ts` with `auth_user`, `auth_session`,
     `auth_verification`, `user_profile` per ERD.
   - `bun run db:generate` → migration file. `bun run db:migrate` →
     applies. Verify in `psql`.

3. **better-auth integration**
   - Install `better-auth` + drizzle adapter.
   - Write `src/auth.ts`: `betterAuth({ database: drizzleAdapter(db, …),
     emailAndPassword: { enabled, requireEmailVerification, …
     sendResetPassword, sendVerificationEmail }, session: { cookieCache,
     expiresIn: 30d }, advanced: { cookies: { … secure, sameSite }} })`.
   - Wire mailer hooks to use the `Mailer` factory.

4. **Mailer abstraction**
   - `Mailer` interface: `send({ to, subject, html, text })`.
   - SMTP impl with `nodemailer`. Resend impl using their SDK.
   - Factory selects via `MAILER` env. Throws clearly if config missing.

5. **Elysia app**
   - `src/index.ts`: create Elysia, mount CORS (allow `WEB_ORIGIN`,
     `credentials: true`), mount `/auth/*` from better-auth handler,
     mount `/me`, `/health`. `export type App = typeof app`.
   - `bun --hot src/index.ts` boots; `curl /health` responds.

6. **Eden client + auth store on web**
   - `apps/web/package.json`: add `server: workspace:*`,
     `@elysiajs/eden` (already present), `zustand`,
     `@tanstack/react-query`, `@tanstack/react-form`.
   - `src/lib/api.ts` builds the treaty client with credentials.
   - `src/stores/auth.ts`: Zustand store with `user | null`,
     `loading`, `refresh()` (calls `api.me.get()`), `signOut()`.
   - Provide a `<QueryClientProvider>` at the root.

7. **Layout guards**
   - `_unauth.tsx`: `beforeLoad` does `await authStore.refresh()`; if
     `user` exists redirect to `/me`.
   - `_auth.tsx`: same refresh; if no `user` redirect to
     `/login?next=<href>`.
   - `_auth/_verified.tsx`: not in this slice; stub for next slice.

8. **Auth pages**
   - Login / Register / Forgot / Reset / Verify built with TanStack
     Form + shadcn Input/Button. Mobile-first per NFR-U1.
   - Submit → call `api.auth.*`. On success, refresh `authStore` and
     navigate to `next` or `/me`.
   - Verify page: reads `?token=`, hits `GET /auth/verify-email`,
     shows success/failure.

9. **End-to-end smoke test**
   - Register a user; confirm verification email arrives in MailHog.
   - Click the verification link; land on `/me` with verified state.
   - Log out; log in again; visit a protected route directly →
     redirected to `/login?next=...`; after login, redirected back.
   - Forgot password flow: receive email, follow link, set new
     password, log in.

## Env vars

```
# .env.example
DATABASE_URL=postgres://jeopardy:jeopardy@localhost:5432/jeopardy
BETTER_AUTH_SECRET=change-me-to-32+ random bytes
BETTER_AUTH_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:5173

MAILER=smtp                    # smtp | resend
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=no-reply@jeopardy.local

# Only needed if MAILER=resend
RESEND_API_KEY=
```

## Verification (per [`../plan.md`](../plan.md) §"Verification")

Manual:
1. `docker compose up -d`
2. `bun install`
3. `cd apps/server && bun run db:migrate && bun run dev`
4. `cd apps/web && bun run dev`
5. Open `http://localhost:5173`, register, verify, log in/out, forgot
   flow.
6. `curl -i http://localhost:3000/me` → `401`.
7. After login, browser visit to a protected page should not redirect.

Automated: defer until schema is stable (per master plan).

## Definition of done

- All env vars documented in `.env.example`.
- Manual smoke test passes end-to-end.
- `bun run lint` is clean.
- TypeScript compiles in both apps with no errors.
- Eden type import works: `import type { App } from 'server'` in web
  has no red squiggle.
- Commit set tells a coherent story; PR (or branch merge) lands on
  `devel` separately from later slices.

## Risks / things to watch

- **better-auth ↔ Elysia integration**: better-auth's framework
  adapters list Elysia; double-check the current docs at install time
  for the exact `mount` shape. If anything is half-baked, fall back
  to the framework-agnostic `auth.handler` and mount it under `/auth/*`
  manually.
- **Cookie cross-origin in dev**: Vite (5173) and server (3000) are
  different origins. `SameSite=Lax` works because both are `localhost`,
  but `Secure` cookies require HTTPS — set `Secure` only when
  `NODE_ENV=production` to avoid silent failures in dev.
- **Argon2 native build**: better-auth uses Web Crypto where possible.
  Confirm the package installs cleanly under bun on Linux without
  needing build tools; fall back to scrypt if needed (less ideal).
- **Drizzle ↔ better-auth schema drift**: better-auth may add columns
  in minor versions. Pin the version and re-generate migrations on
  upgrade rather than chasing.
