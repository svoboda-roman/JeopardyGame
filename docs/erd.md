# Entity-Relationship Diagram

Logical data model for v1. Implementation lives in
`apps/server/src/db/schema.ts` (Drizzle). The identity tables (`user`,
`session`, `account`, `verification`) are managed by `better-auth` — they
follow the library's default names, do not hand-edit those rows in
production. Diagram nodes below labelled `AUTH_*` correspond to those
tables. App-specific extensions live in `user_profile` (1:1 with `user`).

> **Conventions**
> - Primary keys are `id uuid` unless noted.
> - All tables have `created_at timestamptz` and (where mutable)
>   `updated_at timestamptz`, defaulting to `now()`.
> - `*_at` columns are `timestamptz`; never naive timestamps.
> - Soft delete via `deleted_at timestamptz NULL` only where called out.

## Diagram

```mermaid
erDiagram
    AUTH_USER ||--o{ AUTH_SESSION : "has"
    AUTH_USER ||--o{ AUTH_VERIFICATION : "has"
    AUTH_USER ||--|| USER_PROFILE : "extends"

    USER_PROFILE ||--o{ QUIZ : "owns"
    USER_PROFILE ||--o{ MEDIA : "owns"
    USER_PROFILE ||--o{ GAME : "hosts"
    USER_PROFILE ||--o{ GAME_PLAYER : "joins as"

    QUIZ ||--o{ CATEGORY : "has"
    CATEGORY ||--o{ QUESTION : "has"
    QUIZ ||--o| FINAL_QUESTION : "may have"

    QUESTION }o--o{ MEDIA : "references via"
    FINAL_QUESTION }o--o{ MEDIA : "references via"
    QUESTION_MEDIA }|--|| QUESTION : ""
    QUESTION_MEDIA }|--|| MEDIA : ""

    QUIZ ||--o| QUIZ_SHARE : "has"

    QUIZ ||--o{ GAME : "instantiates"
    GAME ||--|| GAME_SNAPSHOT : "snapshots"
    GAME ||--o{ GAME_PLAYER : "has"
    GAME ||--o{ GAME_EVENT : "logs"
    GAME ||--o{ GAME_QUESTION_STATE : "tracks"

    GAME_PLAYER ||--o{ GAME_EVENT : "produces"

    AUTH_USER {
        uuid id PK
        text email UK
        text password_hash
        bool email_verified
        timestamptz created_at
    }

    AUTH_SESSION {
        uuid id PK
        uuid user_id FK
        text token_hash
        timestamptz expires_at
        text user_agent
        text ip
    }

    AUTH_VERIFICATION {
        uuid id PK
        uuid user_id FK
        text purpose "verify_email | reset_password"
        text token_hash
        timestamptz expires_at
        timestamptz used_at
    }

    USER_PROFILE {
        uuid user_id PK_FK
        text display_name
        text avatar_media_id FK_NULL
        timestamptz deleted_at
    }

    QUIZ {
        uuid id PK
        uuid owner_id FK
        text title
        text description
        timestamptz created_at
        timestamptz updated_at
    }

    QUIZ_SHARE {
        uuid id PK
        uuid quiz_id FK_UK
        text token UK "unguessable"
        timestamptz created_at
        timestamptz revoked_at
    }

    CATEGORY {
        uuid id PK
        uuid quiz_id FK
        int position "0..5"
        text title
    }

    QUESTION {
        uuid id PK
        uuid category_id FK
        int position "0..4"
        int point_value
        bool is_daily_double
        text clue
        text answer
    }

    FINAL_QUESTION {
        uuid id PK
        uuid quiz_id FK_UK
        text category
        text clue
        text answer
    }

    MEDIA {
        uuid id PK
        uuid owner_id FK
        text kind "image | audio"
        text mime
        int bytes
        int duration_ms "audio only"
        text storage_key "opaque key in Storage backend"
        timestamptz created_at
    }

    QUESTION_MEDIA {
        uuid question_id FK
        uuid media_id FK
        int position
    }

    GAME {
        uuid id PK
        text room_code UK "6 chars"
        uuid quiz_id FK
        uuid host_id FK
        text status "lobby | active | paused | completed | aborted"
        jsonb options "timers, FJ enabled, etc."
        timestamptz created_at
        timestamptz started_at
        timestamptz ended_at
    }

    GAME_SNAPSHOT {
        uuid game_id PK_FK
        jsonb quiz "frozen quiz tree"
    }

    GAME_PLAYER {
        uuid id PK
        uuid game_id FK
        uuid user_id FK_NULL "null = guest"
        text display_name
        text guest_token "browser session, for reconnect"
        int score
        text status "joined | left | kicked | disconnected"
        timestamptz joined_at
        timestamptz left_at
    }

    GAME_QUESTION_STATE {
        uuid id PK
        uuid game_id FK
        uuid question_ref "id within snapshot tree"
        text state "unselected | open | buzzed | answering | judged | closed"
        uuid current_player_id FK_NULL
        timestamptz opened_at
        timestamptz buzzed_at
        timestamptz closed_at
    }

    GAME_EVENT {
        uuid id PK
        uuid game_id FK
        uuid actor_player_id FK_NULL
        text type "buzz | judge | wager | answer_submit | host_action ..."
        jsonb payload
        timestamptz at
    }
```

## Relationship notes

- **One profile per auth user** (`AUTH_USER 1—1 USER_PROFILE`). Better-auth
  owns identity/credential data; `user_profile` carries app-specific
  fields. PK = FK = `user_id` so they share a key.
- **Quiz ownership is hard FK**: deleting a profile deletes their
  quizzes (cascade). Historical games are preserved via
  `GAME_SNAPSHOT`.
- **Game references a quiz** for traceability (FR-Q9), but the
  authoritative content during play is `GAME_SNAPSHOT.quiz` (FR-G2).
- **Players may be guests**: `GAME_PLAYER.user_id` is nullable;
  `guest_token` (server-issued, stored client-side as an HTTP-only
  cookie scoped to the game) supports reconnection (FR-J4, FR-R2).
- **Question media is many-to-many** through `QUESTION_MEDIA` so a
  single uploaded asset can be reused across questions.
- **Game state during play** is split: live progress in
  `GAME_QUESTION_STATE` (mutable), full audit in `GAME_EVENT`
  (append-only). `GAME_EVENT` is the recovery source if the in-memory
  state is lost (NFR-A3).

## Indexes (initial)

| Table | Index | Purpose |
| --- | --- | --- |
| `auth_user` | `(email)` UNIQUE | login lookup |
| `auth_session` | `(token_hash)` UNIQUE; `(user_id)` | session lookup, listing |
| `auth_session` | `(expires_at)` | sweeper |
| `quiz` | `(owner_id, updated_at DESC)` | "My Quizzes" listing |
| `quiz_share` | `(token)` UNIQUE | share link lookup |
| `media` | `(owner_id)`; `(created_at)` for GC scan | ownership + GC |
| `question_media` | `(question_id)`; `(media_id)` | reference scan for GC |
| `game` | `(room_code)` UNIQUE; `(host_id, status)` | join lookup, host's active game |
| `game_player` | `(game_id, status)`; `(game_id, user_id)`; `(game_id, guest_token)` UNIQUE WHERE `guest_token IS NOT NULL` | live roster, reconnect |
| `game_event` | `(game_id, at)` | replay / audit |
| `game_question_state` | `(game_id, question_ref)` UNIQUE | live state |

## Constraints

- `quiz` has at most one `quiz_share` (UK on `quiz_id`).
- `game.room_code` is generated from a curated alphabet (FR-G1, NFR-S7);
  uniqueness enforced by index plus retry on collision.
- `game.host_id` may have at most one row in `game` with `status IN
  ('lobby', 'active', 'paused')` (FR-G6) — partial unique index.
- `game_player.score` is `int`; nothing stops it going negative
  (Jeopardy convention).
- `category.position` UNIQUE within `(quiz_id, position)`; same for
  `question.position` within `(category_id, position)`.
