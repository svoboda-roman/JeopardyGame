# Sequence Diagrams

Selected end-to-end flows. Each diagram traces messages between actors
and components for a single use case. Components:

- **Browser (Web)** — React SPA in `apps/web`.
- **API (Server)** — Elysia HTTP routes in `apps/server`.
- **WS (Server)** — Elysia WebSocket handler in `apps/server`.
- **Auth** — better-auth library inside the server.
- **DB** — PostgreSQL via Drizzle.
- **Storage** — local-disk Storage backend.
- **Mailer** — transactional email provider.

## 1. Register + email verification (UC1, UC2)

```mermaid
sequenceDiagram
    actor User
    participant Web as Browser
    participant API
    participant Auth
    participant DB
    participant Mailer

    User->>Web: fill register form
    Web->>API: POST /auth/sign-up {email, password, name}
    API->>Auth: signUp.email(...)
    Auth->>DB: INSERT auth_user, user_profile
    Auth->>DB: INSERT auth_verification (verify_email)
    Auth-->>API: {user, session}
    API-->>Web: 200 + Set-Cookie session
    API->>Mailer: send verification email (async)
    Web-->>User: redirect /me (unverified state)

    Note over User,Mailer: Later — user opens email
    User->>Web: GET /verify?token=...
    Web->>API: GET /auth/verify-email?token=...
    API->>Auth: verifyEmail(token)
    Auth->>DB: UPDATE auth_user SET email_verified = true
    Auth->>DB: UPDATE auth_verification SET used_at
    Auth-->>API: ok
    API-->>Web: 302 /me
```

## 2. Login (UC3)

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant API
    participant Auth
    participant DB

    User->>Web: submit credentials
    Web->>API: POST /auth/sign-in {email, password}
    API->>Auth: signIn.email(...)
    Auth->>DB: SELECT auth_user WHERE email = ?
    Auth->>Auth: argon2.verify(hash, password)
    Auth->>DB: INSERT auth_session
    Auth-->>API: session
    API-->>Web: 200 + Set-Cookie

    alt invalid credentials
        Auth-->>API: error
        API-->>Web: 401 (generic message)
    end
```

## 3. Create quiz + upload media (UC10, UC15)

```mermaid
sequenceDiagram
    actor Owner
    participant Web
    participant API
    participant Storage
    participant DB

    Owner->>Web: click "New quiz"
    Web->>API: POST /quizzes {title}
    API->>DB: INSERT quiz, 6 categories, 30 questions (defaults)
    API-->>Web: {quiz}

    Owner->>Web: edit clue, drop image
    Web->>API: POST /media (multipart)
    API->>API: validate type/size/duration
    API->>Storage: put(stream) → key
    API->>DB: INSERT media
    API-->>Web: {media: {id, url}}

    Web->>API: PATCH /questions/:id {clue, answer, media_ids:[...]}
    API->>DB: UPDATE question; UPSERT question_media
    API-->>Web: ok
```

## 4. Start game (UC20)

```mermaid
sequenceDiagram
    actor Host
    participant Web
    participant API
    participant DB

    Host->>Web: click "Host game" on quiz
    Web->>API: POST /games {quiz_id, options}
    API->>DB: SELECT 1 FROM game WHERE host_id=? AND status IN (lobby,active,paused)
    alt host has another active game
        API-->>Web: 409 Conflict
    else
        API->>DB: BEGIN
        API->>API: generate room_code (retry on collision)
        API->>DB: INSERT game (status=lobby)
        API->>DB: SELECT quiz tree; INSERT game_snapshot
        API->>DB: COMMIT
        API-->>Web: {game: {id, room_code}}
        Web-->>Host: navigate /host/:room_code
    end
```

## 5. Join game (UC30)

```mermaid
sequenceDiagram
    actor Player
    participant Web
    participant API
    participant DB

    Player->>Web: enter code + display name
    Web->>API: POST /games/:room_code/join {display_name, guest_token?}
    API->>DB: SELECT game WHERE room_code = ?
    API->>API: validate status, capacity
    alt accept
        API->>DB: INSERT game_player (or UPDATE if reconnect)
        API-->>Web: {player_id, game} + Set-Cookie guest_token (if guest)
        Web-->>Player: navigate /play/:room_code
    else reject
        API-->>Web: 4xx with reason (not_found / full / aborted)
    end
```

## 6. Connect to game WebSocket + initial snapshot (UC34, FR-R2)

```mermaid
sequenceDiagram
    participant Web
    participant WS
    participant DB

    Web->>WS: WS upgrade /games/:room_code (cookie session OR guest_token)
    WS->>DB: SELECT game_player WHERE game_id=? AND (user_id=? OR guest_token=?)
    alt unknown
        WS-->>Web: close 4401
    else
        WS->>DB: SELECT current game_question_state, scores, players
        WS-->>Web: server→client {type:"snapshot", payload:{...}}
        Note over Web,WS: subsequent events are deltas
    end
```

## 7. Buzz cycle — single question (UC22, UC31, UC23)

```mermaid
sequenceDiagram
    participant HostWeb as Host Web
    participant P1Web as Player 1 Web
    participant P2Web as Player 2 Web
    participant WS
    participant DB

    HostWeb->>WS: client→server {type:"open_question", q_ref}
    WS->>DB: UPDATE game_question_state → open
    WS->>DB: INSERT game_event (type=open)
    WS-->>HostWeb: broadcast {type:"question_open", q_ref, opens_buzz_at:t+3s}
    WS-->>P1Web: same
    WS-->>P2Web: same

    Note over WS: 3s read delay elapses
    WS-->>HostWeb: broadcast {type:"buzz_open"}
    WS-->>P1Web: same
    WS-->>P2Web: same

    P1Web->>WS: client→server {type:"buzz"} (t1)
    P2Web->>WS: client→server {type:"buzz"} (t2 > t1)

    WS->>WS: first valid buzz wins (P1)
    WS->>DB: UPDATE state → buzzed; current_player_id=P1
    WS->>DB: INSERT game_event (type=buzz, actor=P1)
    WS-->>HostWeb: broadcast {type:"buzzed", player_id:P1}
    WS-->>P1Web: same
    WS-->>P2Web: same

    HostWeb->>WS: client→server {type:"judge", verdict:"correct"}
    WS->>DB: UPDATE game_player.score; UPDATE state → closed
    WS->>DB: INSERT game_event (type=judge)
    WS-->>HostWeb: broadcast {type:"judged", verdict:"correct", score_delta:+200}
    WS-->>P1Web: same
    WS-->>P2Web: same

    Note over WS: if verdict was incorrect/no-answer and players remain → state → buzz_open again
```

## 8. Reconnect mid-game (FR-R1, FR-R2)

```mermaid
sequenceDiagram
    actor Player
    participant Web
    participant WS
    participant DB

    Note over Player,Web: tab crashes / WS dies
    Web->>WS: WS upgrade /games/:room_code (cookie/token)
    WS->>DB: lookup game_player; mark status=joined
    WS->>DB: snapshot current state + scoreboard + recent events
    WS-->>Web: {type:"snapshot", payload:{...}}
    WS-->>WS: broadcast {type:"player_reconnected", player_id}
```

If absent > 5 min, the slot is released and the rejoin is treated as a
fresh join (subject to capacity, FR-R1).

## 9. Daily Double (UC24)

```mermaid
sequenceDiagram
    participant HostWeb as Host
    participant PWeb as Player P (picker)
    participant WS
    participant DB

    HostWeb->>WS: open_question {q_ref:DD}
    WS->>DB: UPDATE state → wagering; current_player_id=P
    WS-->>HostWeb: broadcast {type:"daily_double_pending", picker:P, min:5, max:...}
    WS-->>PWeb: same

    PWeb->>WS: {type:"wager", amount:1000}
    WS->>WS: validate bounds
    WS->>DB: UPDATE state → answering
    WS-->>HostWeb: broadcast {type:"clue_revealed"}
    WS-->>PWeb: same

    HostWeb->>WS: {type:"judge", verdict:"correct"}
    WS->>DB: UPDATE score (±wager); state → closed
    WS-->>HostWeb: broadcast {type:"judged"}
    WS-->>PWeb: same
```

## 10. Final Jeopardy (UC25, UC32)

```mermaid
sequenceDiagram
    participant HostWeb as Host
    participant PA as Player A
    participant PB as Player B
    participant WS

    HostWeb->>WS: {type:"start_final"}
    WS-->>HostWeb: broadcast {type:"fj_category", category}
    WS-->>PA: same
    WS-->>PB: same

    PA->>WS: {type:"fj_wager", amount}
    PB->>WS: {type:"fj_wager", amount}
    Note over WS: when all wagers in OR 30s timeout → reveal clue
    WS-->>HostWeb: broadcast {type:"fj_clue", clue}
    WS-->>PA: same
    WS-->>PB: same

    PA->>WS: {type:"fj_answer", text}
    PB->>WS: {type:"fj_answer", text}
    WS-->>HostWeb: broadcast {type:"fj_answers", [{player, text}]}

    HostWeb->>WS: {type:"fj_judge", player:PA, verdict:"correct"}
    HostWeb->>WS: {type:"fj_judge", player:PB, verdict:"incorrect"}
    WS-->>HostWeb: broadcast {type:"fj_done", final_scores:[...]}
    WS-->>PA: same
    WS-->>PB: same
```

## 11. Password reset (UC4)

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant API
    participant Auth
    participant DB
    participant Mailer

    User->>Web: enter email on /reset
    Web->>API: POST /auth/forgot-password {email}
    API->>Auth: forgotPassword(email)
    alt email exists
        Auth->>DB: INSERT auth_verification (reset_password)
        Auth->>Mailer: send reset email with token URL
    end
    API-->>Web: 200 (always — no enumeration)

    User->>Web: open reset link, set new password
    Web->>API: POST /auth/reset-password {token, password}
    API->>Auth: resetPassword(token, password)
    Auth->>DB: validate + UPDATE auth_user.password_hash
    Auth->>DB: DELETE auth_session WHERE user_id = ?
    Auth-->>API: ok
    API-->>Web: 302 /login
```

## 12. Media garbage collection (UC43, FR-M5)

```mermaid
sequenceDiagram
    participant Sched as Scheduler
    participant API
    participant DB
    participant Storage

    Note over Sched: nightly cron
    Sched->>API: GC.media()
    API->>DB: SELECT m FROM media m\nLEFT JOIN question_media qm ON qm.media_id=m.id\nWHERE qm.media_id IS NULL\nAND m.created_at < now() - 24h
    loop per orphan
        API->>Storage: delete(storage_key)
        API->>DB: DELETE FROM media WHERE id = ?
    end
```
