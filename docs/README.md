# JeopardyGame — Documentation

This directory holds the design and requirements artifacts for
JeopardyGame. Read top-to-bottom for a complete picture of what we are
building and why.

## Reading order

1. **[`plan.md`](plan.md)** — Master plan: scope of v1, locked-in
   technology decisions, build order. Start here for the "what and
   why".
2. **[`srs.md`](srs.md)** — Software Requirements Specification:
   numbered functional (`FR-*`) and non-functional (`NFR-*`)
   requirements. The authoritative source for what the system must
   do. Every other doc references these IDs.
3. **[`use-cases.md`](use-cases.md)** — Actor diagram and use case
   descriptions (`UC*`). Maps user intent to features.
4. **[`architecture.md`](architecture.md)** — Repository layout, tech
   stack, type-flow story. Essential context for any code change.
5. **[`erd.md`](erd.md)** — Entity-relationship diagram (mermaid),
   indexes, constraints. The data model that the schema implements.
6. **[`state-machines.md`](state-machines.md)** — Server-authoritative
   state diagrams: game lifecycle, per-question, Daily Double, Final
   Jeopardy, player slot, session, verification token, quiz
   lifecycle.
7. **[`sequence-diagrams.md`](sequence-diagrams.md)** — Twelve key
   end-to-end flows, from register to buzz to media GC.
8. **[`api.md`](api.md)** — REST endpoint catalogue + WebSocket
   message protocol with state-by-state validity table.
9. **[`sitemap.md`](sitemap.md)** — Frontend route map, layout
   guards, navigation graph, page → API mapping.
10. **[`system-diagram.md`](system-diagram.md)** — Component,
    deployment (dev + prod), and trust-boundary diagrams.
11. **[`glossary.md`](glossary.md)** — Authoritative definitions for
    every domain and technical term used above.

## Implementation sub-plans

Sub-plans live under [`plans/`](plans/) and decompose one slice from
[`plan.md`](plan.md) into concrete files, steps, and acceptance.

- [`plans/01-foundation.md`](plans/01-foundation.md) — Postgres,
  Drizzle baseline, better-auth, layout guards. Done.
- [`plans/02-quizzes.md`](plans/02-quizzes.md) — Quiz CRUD + share
  link. Currently active.

## Cross-cutting conventions

- All requirement IDs (`FR-*`, `NFR-*`) trace back to
  [`srs.md`](srs.md). Every other doc references them.
- All use case IDs (`UC*`) trace back to
  [`use-cases.md`](use-cases.md).
- Diagrams are **mermaid** and render natively on GitHub.
- "Open Questions" sections in each doc are tracked, not silently
  ignored — they should be resolved (and the doc updated) before
  the affected slice is implemented.

## Repo-level files worth knowing

- **[`../README.md`](../README.md)** — Public-facing project
  description.
- **[`../CLAUDE.md`](../CLAUDE.md)** — Guidance for AI coding agents
  working in this repo.
- **[`../LICENSE`](../LICENSE)** — Project license.
