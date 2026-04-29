# Sub-plan 02 — Quiz CRUD

> Second implementation slice from [`../plan.md`](../plan.md).
> Builds on slice 01 (auth in place). End of slice: a logged-in user
> can create, edit, list, and delete a text-only quiz, generate a
> share link, and view a shared quiz preview as a guest. **No media
> yet** — that's slice 5.

## Context

With identity working, the next foundational primitive is the quiz
itself: it underpins game hosting (slice 3), media (slice 5), and
profile contents. Getting the schema and ownership story right here
saves rework later. Sharing is included because the share link is the
"how do players know what game they're joining?" prompt and is small
to add now while the routes are open.

## Decisions made for this slice

| Question | Decision | Reason |
| --- | --- | --- |
| Default board shape on quiz creation | Auto-create **6 categories × 5 questions** with empty content (FR-Q2). | Matches Jeopardy structure; the editor is then "fill the blanks" rather than "build from nothing". Less friction. |
| Point values | `100, 200, 300, 400, 500` per row, in ascending category position order. Editable later in a future polish (FR-Q5 allows custom 100–2000). | Sensible default; no UI burden in this slice. |
| Final Jeopardy in this slice | Endpoints for CRUD exist (`PUT/DELETE /quizzes/:id/final`), UI defers final-question editor to slice 4. | Hosting needs the data; UI for it is more naturally added when the host UI lands. |
| OQ-4 — share link metadata | Expose **title + owner display name only**. No question count, no categories. | Smallest leak; can be expanded later without breaking. |
| Quiz delete cascade | Hard delete: cascades to categories → questions. (FR-Q9 about historic games is automatic — games hold a snapshot, see ERD.) | Matches FR-Q6, FR-Q9. Snapshot already protects history. |
| Editor save model | **Optimistic auto-save on blur per field**, with a debounced PATCH. No "Save" button. | Lower friction; mirrors modern editor UX. Loss-of-network shows a toast. |
| Share token format | 32-char URL-safe random (crypto.randomBytes via better-auth-style helper). | Unguessable per FR-Q8 / NFR-S7. |
| Form library | TanStack Form for any non-trivial form (Quiz title, settings later). Plain controlled inputs are fine for the editor cells. | Form library shines when validation matters; question cells are 1-field inline edits. |

## Deliverables

By end of slice:

1. Drizzle schema additions: `quiz`, `category`, `question`, `final_question`, `quiz_share`. Migration generated and applied.
2. REST endpoints (per [`../api.md`](../api.md) §2.3, §2.4):
   - `GET /quizzes` (own)
   - `POST /quizzes` (create with default 6×5 board)
   - `GET /quizzes/:id` (full tree, owner-only)
   - `PATCH /quizzes/:id`, `DELETE /quizzes/:id`
   - `PATCH /categories/:id` (title, position)
   - `PATCH /questions/:id` (clue, answer, pointValue, isDailyDouble)
   - `PUT /quizzes/:id/final`, `DELETE /quizzes/:id/final`
   - `POST /quizzes/:id/share`, `DELETE /quizzes/:id/share`
   - `GET /share/:token` (public, title + owner displayName only)
3. All endpoints validated with Elysia `t` schemas per
   [`../api.md`](../api.md) §4. Authorisation enforced server-side
   (NFR-S3): owner-only checks reject 404 (mask existence) for
   non-owners (per [`../sitemap.md`](../sitemap.md) guard table).
4. Web pages:
   - `/quizzes` — list, "Create new" CTA
   - `/quizzes/new` — kicks off creation, redirects to editor
   - `/quizzes/$quizId` — editor: title field, board grid, share button, delete button (with confirm)
   - `/share/$token` — public share preview (title + owner)
5. Eden-typed API client calls; TanStack Query for list and detail
   queries with `invalidateQueries` on mutations.
6. Tests:
   - **Server (`bun test`)**: integration tests covering each endpoint —
     auth gate (anonymous → 401), ownership gate (other user → 404),
     happy paths (create / read / patch / delete), share flow.
   - **Web (vitest + RTL)**: `/quizzes` renders an empty state and a
     populated list; `/share/$token` renders title + owner; quiz editor
     auto-save fires on blur and shows the saved state.

Out of scope for this slice (intentionally deferred):
- Media upload, image/audio in questions (slice 5).
- Reordering categories / questions via drag-drop (later polish; the
  PATCH `position` endpoint is here but UI uses a number field for
  now).
- Final Jeopardy editor UI (slice 4 alongside host UI).
- Aggregate stats on profile (out of v1 scope).

## Critical files

### `apps/server`
- `src/db/schema.ts` — append `quiz`, `category`, `question`,
  `finalQuestion`, `quizShare` tables. Foreign keys + indexes per
  [`../erd.md`](../erd.md).
- `src/lib/auth-helpers.ts` *(new)* — `requireUser(request)` returns
  the session user or throws a typed 401. Used by every protected
  route. Avoids repeating `auth.api.getSession` boilerplate.
- `src/lib/share-token.ts` *(new)* — generates URL-safe random tokens.
- `src/routes/quizzes.ts` *(new)* — Elysia plugin for `/quizzes/*`.
- `src/routes/share.ts` *(new)* — public `/share/:token`.
- `src/app.ts` — `.use(quizzes).use(share)`.

### `apps/web`
- `src/lib/api.ts` — already typed via `App`, no manual changes.
- `src/routes/_auth/quizzes/index.tsx` *(new)* — list page.
- `src/routes/_auth/quizzes/new.tsx` *(new)* — create + redirect.
- `src/routes/_auth/quizzes/$quizId.tsx` *(new)* — editor.
- `src/routes/share.$token.tsx` *(new)* — public preview.
- `src/components/quiz-board.tsx` *(new)* — board grid component.
- `src/lib/share-url.ts` *(new)* — builds the absolute share URL for
  copy-to-clipboard.

### Tests
- `apps/server/test/quizzes.test.ts` *(new)* — full endpoint coverage.
- `apps/server/test/share.test.ts` *(new)* — share lifecycle.
- `apps/server/test/helpers.ts` — extend with a `signUpAndGetCookie()`
  helper to avoid repeating signup in every test.
- `apps/web/test/quizzes.test.tsx` *(new)* — list page rendering.
- `apps/web/test/share-preview.test.tsx` *(new)*.
- `apps/web/test/quiz-editor.test.tsx` *(new)* — auto-save behaviour.

## Step-by-step

1. **Schema + migration**
   - Append the five tables to `apps/server/src/db/schema.ts` with the
     columns from [`../erd.md`](../erd.md). Use `text('id').primaryKey().$defaultFn(...)`
     to generate IDs (matches better-auth pattern; we don't need uuid
     extension).
   - `bun run db:generate` → review SQL → `bun run db:migrate`.
   - Verify in `psql` (`\d quiz`, etc.).

2. **Auth helper**
   - Tiny `requireUser(request)` returning the user or throwing
     `{ status: 401, body: { error: ... } }`. Used by all protected
     routes.

3. **`/quizzes` endpoints** (in order)
   - `POST /quizzes` first — needed to seed test data for everything
     else.
   - `GET /quizzes`, `GET /quizzes/:id`.
   - `PATCH`, `DELETE`.
   - `PATCH /categories/:id`, `PATCH /questions/:id`.
   - `PUT/DELETE /quizzes/:id/final`.
   - Each endpoint: write the route + write its test in the same
     commit (per CLAUDE.md "Testing" rule).

4. **Sharing**
   - `POST /quizzes/:id/share` returns existing token if any
     (idempotent, per [`../api.md`](../api.md) §5).
   - `DELETE /quizzes/:id/share` revokes (sets `revoked_at`).
   - Public `GET /share/:token` excludes revoked tokens, returns title
     + owner display name only.

5. **Web list + create**
   - `/quizzes`: TanStack Query `quizzes.list`. Empty state with a CTA.
   - `/quizzes/new`: imperative call to `POST /quizzes`, then
     `navigate({ to: '/quizzes/$quizId', params: { quizId } })`.

6. **Web editor**
   - `/quizzes/$quizId`: load full tree.
   - Title input — debounced PATCH on blur or 500ms after last
     keystroke.
   - Board: 6 columns × (1 category title row + 5 question cells).
     Click a cell → opens a panel (or modal) to edit clue + answer +
     point value + DD flag. Save on blur.
   - Share button → calls `POST /share`, copies URL to clipboard,
     toasts.
   - Delete button → confirm modal → `DELETE` → navigate to
     `/quizzes`.

7. **Web share preview**
   - `/share/$token`: read-only card with title + "by {ownerName}".
     If revoked / 404 → render the standard not-found.

8. **Integration test sweep**
   - Run `bun test` in `apps/server` — all green.
   - Run `bun run test` in `apps/web` — all green.
   - Manual sanity: create a quiz, edit a cell, share, open the share
     URL in incognito, delete the quiz, confirm gone.

## Verification (definition of done)

- All five new tables present in the migrated DB.
- All endpoints in [`../api.md`](../api.md) §2.3, §2.4 implemented and
  authoring matches the table.
- Server `bun test` passes; new tests cover at least the auth gate +
  ownership gate + happy path for each endpoint.
- Web `bun run test` passes for the new pages.
- Manual flow: register → create quiz → edit one question → share →
  open share URL anonymously → see title + owner → delete quiz →
  shared URL now 404s.
- `bun run lint` clean across both apps.
- TypeScript clean: `bunx tsc --noEmit` in each app.

## Risks / things to watch

- **Cascade deletes**: `quiz` deletion must cascade to `category` and
  `question`. Drizzle FKs with `onDelete: 'cascade'`. Verified by a
  test.
- **Owner-checks must 404, not 403** for unknown / unowned quizzes
  (mask existence per sitemap §4). Easy to forget.
- **Eden type sync**: the web app's `App` type import will pick up
  the new routes only after a server type-check pass. If the IDE
  acts up, restart the TS server.
- **Auto-save races**: typing while a previous PATCH is in flight.
  Debounce per field; the latest payload wins. Don't try to merge
  responses optimistically into the cache yet — `invalidateQueries`
  is enough at this stage.
- **Share token storage**: store **the token itself** (NOT a hash)
  because we need to recover it for "show the URL" UX. This is fine
  because the token is high entropy and treated as a secret URL
  parameter, not a credential. Document this in the schema comment.

## Then what?

Slice 3 is the realtime spike: WebSocket protocol + the buzz cycle for
a single question, exercising the game state machine for the first
time. We'll write a fresh sub-plan when we get there.

We will also add `@elysiajs/openapi` once the API surface is stable
(after this slice's endpoints land), per the user's request — it
generates an OpenAPI doc from the existing Elysia `t` schemas.
