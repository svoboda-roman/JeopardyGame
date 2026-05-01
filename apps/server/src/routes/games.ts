import { and, asc, count, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client.ts";
import {
	category as categoryTable,
	finalQuestion as finalQuestionTable,
	gamePlayer as gamePlayerTable,
	gameSnapshot as gameSnapshotTable,
	game as gameTable,
	question as questionTable,
	quiz as quizTable,
	userProfile as userProfileTable,
	user as userTable,
} from "../db/schema.ts";
import type {
	InternalBoard,
	InternalFinalQuestion,
	InternalQuestion,
} from "../game/state.ts";

import { HttpError, notFound, requireUser } from "../lib/auth-helpers.ts";
import { generateRoomCode } from "../lib/room-code.ts";

export interface PersistedSnapshot {
	board: InternalBoard;
	finalQuestion: InternalFinalQuestion | null;
}

// Tunable cap from sub-plan A2 — 6 players (incl. host).
const MAX_PLAYERS_PER_GAME = 6;

async function snapshotQuiz(
	quizId: string,
	ownerId: string,
	opts: { includeFinal: boolean },
): Promise<PersistedSnapshot> {
	const q = await db
		.select()
		.from(quizTable)
		.where(and(eq(quizTable.id, quizId), eq(quizTable.ownerId, ownerId)))
		.limit(1);
	if (q.length === 0) notFound("Quiz not found");
	const cats = await db
		.select()
		.from(categoryTable)
		.where(eq(categoryTable.quizId, quizId))
		.orderBy(asc(categoryTable.position));
	const catIds = cats.map((c) => c.id);
	const allQs =
		catIds.length === 0
			? []
			: await Promise.all(
					catIds.map((id) =>
						db
							.select()
							.from(questionTable)
							.where(eq(questionTable.categoryId, id))
							.orderBy(asc(questionTable.position)),
					),
				).then((r) => r.flat());

	const questions: Record<string, InternalQuestion> = {};
	for (const qq of allQs) {
		questions[qq.id] = {
			ref: qq.id,
			categoryRef: qq.categoryId,
			position: qq.position,
			pointValue: qq.pointValue,
			isDailyDouble: qq.isDailyDouble,
			clue: qq.clue,
			answer: qq.answer,
		};
	}

	const board: InternalBoard = {
		categories: cats.map((c) => ({
			ref: c.id,
			position: c.position,
			title: c.title,
			questionRefs: allQs
				.filter((qq) => qq.categoryId === c.id)
				.map((qq) => qq.id),
		})),
		questions,
	};

	let finalQuestion: InternalFinalQuestion | null = null;
	if (opts.includeFinal) {
		const fq = await db
			.select()
			.from(finalQuestionTable)
			.where(eq(finalQuestionTable.quizId, quizId))
			.limit(1);
		const row = fq[0];
		if (row) {
			finalQuestion = {
				category: row.category,
				clue: row.clue,
				answer: row.answer,
			};
		}
	}

	return { board, finalQuestion };
}

export const games = new Elysia({ tags: ["games"] })
	.onError(({ error, set }) => {
		if (error instanceof HttpError) {
			set.status = error.status;
			return { error: { code: error.code, message: error.message } };
		}
	})

	.post(
		"/games",
		async ({ request, body, set }) => {
			const u = await requireUser(request);
			const finalEnabled = body.options?.finalEnabled ?? false;
			const snapshot = await snapshotQuiz(body.quizId, u.id, {
				includeFinal: finalEnabled,
			});
			const readDelayMs = body.options?.readDelayMs ?? 3000;

			// Read host display name once (profile preferred, fallback to user.name).
			const profileRow = (
				await db
					.select({
						displayName: userProfileTable.displayName,
						fallback: userTable.name,
					})
					.from(userTable)
					.leftJoin(userProfileTable, eq(userProfileTable.userId, userTable.id))
					.where(eq(userTable.id, u.id))
					.limit(1)
			)[0];
			const hostName =
				profileRow?.displayName ?? profileRow?.fallback ?? "Host";

			// Try a few times in case of room-code collision (very rare with 21^6).
			const MAX_ATTEMPTS = 5;
			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
				const roomCode = generateRoomCode();
				try {
					const created = await db.transaction(async (tx) => {
						const [g] = await tx
							.insert(gameTable)
							.values({
								roomCode,
								quizId: body.quizId,
								hostId: u.id,
								status: "lobby",
								options: { readDelayMs, finalEnabled },
							})
							.returning();
						if (!g) throw new Error("game insert returned no row");

						await tx
							.insert(gameSnapshotTable)
							.values({ gameId: g.id, quiz: snapshot });
						await tx.insert(gamePlayerTable).values({
							gameId: g.id,
							userId: u.id,
							displayName: hostName,
							status: "joined",
						});
						return g;
					});
					set.status = 201;
					return { game: { id: created.id, roomCode: created.roomCode } };
				} catch (e) {
					const err = e as {
						code?: string;
						constraint?: string;
						message?: string;
						cause?: unknown;
					};
					const cause = err.cause as
						| { code?: string; constraint?: string }
						| undefined;
					const code = err.code ?? cause?.code;
					const constraint = err.constraint ?? cause?.constraint;
					const msg = String(err.message ?? "");
					const isUnique = code === "23505";
					if (
						isUnique &&
						(constraint === "game_room_code_uk" ||
							msg.includes("game_room_code_uk"))
					) {
						continue;
					}
					if (
						isUnique &&
						(constraint === "game_host_active_uk" ||
							msg.includes("game_host_active_uk"))
					) {
						throw new HttpError(
							409,
							"conflict",
							"You already have an active game.",
						);
					}
					throw e;
				}
			}
			throw new HttpError(500, "internal", "Could not allocate a room code.");
		},
		{
			body: t.Object({
				quizId: t.String(),
				options: t.Optional(
					t.Object({
						readDelayMs: t.Optional(t.Integer({ minimum: 0, maximum: 10000 })),
						finalEnabled: t.Optional(t.Boolean()),
					}),
				),
			}),
		},
	)

	// Lookup metadata by room code. Auth required only enough to know who you
	// are (or that you're a guest); enforces nothing else here — WS does the
	// membership gate.
	.get("/games/:roomCode", async ({ params }) => {
		const rows = await db
			.select()
			.from(gameTable)
			.where(eq(gameTable.roomCode, params.roomCode.toUpperCase()))
			.limit(1);
		const g = rows[0];
		if (!g) notFound("Game not found");
		return {
			game: {
				id: g.id,
				roomCode: g.roomCode,
				status: g.status,
				hostId: g.hostId,
			},
		};
	})

	.post(
		"/games/:roomCode/join",
		async ({ request, params, body, cookie, set }) => {
			const code = params.roomCode.toUpperCase();
			const games = await db
				.select()
				.from(gameTable)
				.where(eq(gameTable.roomCode, code))
				.limit(1);
			const g = games[0];
			if (!g) notFound("Game not found");
			if (
				g.status !== "lobby" &&
				g.status !== "active" &&
				g.status !== "paused"
			) {
				throw new HttpError(409, "not_joinable", "Game is not joinable");
			}

			// Caller may be authenticated or a guest.
			let user: { id: string; name: string } | null = null;
			try {
				user = await requireUser(request);
			} catch {
				user = null;
			}

			// Already a member? (Same user or same guest_token.)
			const guestCookie: string | null =
				(cookie[`guest_token_${code}`]?.value as string | undefined) ?? null;
			const guestToken: string | null = body.guestToken ?? guestCookie;
			const candidate = user
				? eq(gamePlayerTable.userId, user.id)
				: guestToken
					? eq(gamePlayerTable.guestToken, guestToken)
					: null;
			if (candidate) {
				const existing = await db
					.select()
					.from(gamePlayerTable)
					.where(and(eq(gamePlayerTable.gameId, g.id), candidate))
					.limit(1);
				const existingRow = existing[0];
				if (existingRow) {
					// Idempotent rejoin.
					await db
						.update(gamePlayerTable)
						.set({ status: "joined", leftAt: null })
						.where(eq(gamePlayerTable.id, existingRow.id));
					if (!user && existingRow.guestToken) {
						cookie[`guest_token_${code}`]?.set({
							value: existingRow.guestToken,
							httpOnly: true,
							sameSite: "lax",
							secure: process.env.NODE_ENV === "production",
							path: "/",
						});
					}
					return { playerId: existingRow.id };
				}
			}

			// Capacity check (FR-J3, sub-plan A2).
			const c = await db
				.select({ n: count() })
				.from(gamePlayerTable)
				.where(
					and(
						eq(gamePlayerTable.gameId, g.id),
						eq(gamePlayerTable.status, "joined"),
					),
				);
			if ((c[0]?.n ?? 0) >= MAX_PLAYERS_PER_GAME) {
				throw new HttpError(409, "full", "Game is full");
			}

			const newGuestToken: string | null = user
				? null
				: (guestToken ?? crypto.randomUUID());
			const [created] = await db
				.insert(gamePlayerTable)
				.values({
					gameId: g.id,
					userId: user?.id ?? null,
					displayName: body.displayName,
					guestToken: newGuestToken,
					status: "joined",
				})
				.returning();
			if (!created)
				throw new HttpError(500, "internal", "join insert returned no row");

			if (newGuestToken) {
				cookie[`guest_token_${code}`]?.set({
					value: newGuestToken,
					httpOnly: true,
					sameSite: "lax",
					secure: process.env.NODE_ENV === "production",
					path: "/",
				});
			}
			set.status = 200;
			return { playerId: created.id };
		},
		{
			params: t.Object({ roomCode: t.String() }),
			body: t.Object({
				displayName: t.String({ minLength: 1, maxLength: 32 }),
				guestToken: t.Optional(t.String()),
			}),
		},
	);
