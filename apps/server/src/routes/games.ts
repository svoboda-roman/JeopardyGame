import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client.ts";
import {
	answerMedia as answerMediaTable,
	category as categoryTable,
	drink as drinkTable,
	finalQuestion as finalQuestionTable,
	gamePlayer as gamePlayerTable,
	gameResult as gameResultTable,
	gameSnapshot as gameSnapshotTable,
	game as gameTable,
	media as mediaTable,
	questionMedia as questionMediaTable,
	question as questionTable,
	quiz as quizTable,
	userProfile as userProfileTable,
	user as userTable,
} from "../db/schema.ts";
import type { DrinkView } from "../game/protocol.ts";
import { evictRoom, peekRoom, type RankingEntry } from "../game/rooms.ts";
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
	drinks: DrinkView[];
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

	const allQIds = allQs.map((qq) => qq.id);
	const [mediaJoins, answerMediaJoins] = allQIds.length
		? await Promise.all([
				db
					.select({
						questionId: questionMediaTable.questionId,
						position: questionMediaTable.position,
						id: mediaTable.id,
						mime: mediaTable.mime,
					})
					.from(questionMediaTable)
					.innerJoin(mediaTable, eq(mediaTable.id, questionMediaTable.mediaId))
					.where(inArray(questionMediaTable.questionId, allQIds))
					.orderBy(asc(questionMediaTable.position)),
				db
					.select({
						questionId: answerMediaTable.questionId,
						position: answerMediaTable.position,
						id: mediaTable.id,
						mime: mediaTable.mime,
					})
					.from(answerMediaTable)
					.innerJoin(mediaTable, eq(mediaTable.id, answerMediaTable.mediaId))
					.where(inArray(answerMediaTable.questionId, allQIds))
					.orderBy(asc(answerMediaTable.position)),
			])
		: [[], []];

	const mediaByQ: Record<string, { id: string; mime: string; url: string }[]> =
		{};
	for (const m of mediaJoins) {
		const list = mediaByQ[m.questionId] ?? [];
		list.push({ id: m.id, mime: m.mime, url: `/media/${m.id}/file` });
		mediaByQ[m.questionId] = list;
	}
	const answerMediaByQ: Record<
		string,
		{ id: string; mime: string; url: string }[]
	> = {};
	for (const m of answerMediaJoins) {
		const list = answerMediaByQ[m.questionId] ?? [];
		list.push({ id: m.id, mime: m.mime, url: `/media/${m.id}/file` });
		answerMediaByQ[m.questionId] = list;
	}

	const questions: Record<string, InternalQuestion> = {};
	for (const qq of allQs) {
		questions[qq.id] = {
			ref: qq.id,
			categoryRef: qq.categoryId,
			position: qq.position,
			pointValue: qq.pointValue,
			isDailyDouble: qq.isDailyDouble,
			isShot: false,
			clue: qq.clue,
			answer: qq.answer,
			media: mediaByQ[qq.id] ?? [],
			answerMedia: answerMediaByQ[qq.id] ?? [],
			youtubeId: qq.youtubeId ?? null,
			answerYoutubeId: qq.answerYoutubeId ?? null,
			hostNotes: qq.hostNotes ?? null,
			buzzWindowMs: qq.buzzWindowMs ?? null,
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

	const drinkRows = await db
		.select()
		.from(drinkTable)
		.where(eq(drinkTable.quizId, quizId))
		.orderBy(asc(drinkTable.position));
	const drinks: DrinkView[] = drinkRows.map((d) => ({
		id: d.id,
		name: d.name,
		amount: d.amount === "sip" ? "sip" : "shot",
		price: d.price,
	}));

	return { board, finalQuestion, drinks };
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
			const manualPoints = body.options?.manualPoints ?? false;
			const allowReopen = body.options?.allowReopen ?? false;
			const ddCount = body.options?.ddCount ?? 0;
			const shotsCount = body.options?.shotsCount ?? 0;

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
					const { created, abortedRoomCodes } = await db.transaction(
						async (tx) => {
							// Auto-abort any prior in-flight game owned by this host so
							// the unique partial index `game_host_active_uk` lets the new
							// row in (FR-G6: only one in-flight game per host).
							const aborted = await tx
								.update(gameTable)
								.set({ status: "aborted", endedAt: sql`now()` })
								.where(
									and(
										eq(gameTable.hostId, u.id),
										inArray(gameTable.status, ["lobby", "active", "paused"]),
									),
								)
								.returning({ roomCode: gameTable.roomCode });

							const [g] = await tx
								.insert(gameTable)
								.values({
									roomCode,
									quizId: body.quizId,
									hostId: u.id,
									status: "lobby",
									options: {
										readDelayMs,
										finalEnabled,
										manualPoints,
										allowReopen,
										ddCount,
										shotsCount,
									},
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
							return {
								created: g,
								abortedRoomCodes: aborted.map((r) => r.roomCode),
							};
						},
					);
					// Drop in-memory drivers for any games we just aborted so any
					// still-connected sockets stop receiving broadcasts.
					for (const code of abortedRoomCodes) evictRoom(code);
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
						manualPoints: t.Optional(t.Boolean()),
						allowReopen: t.Optional(t.Boolean()),
						ddCount: t.Optional(t.Integer({ minimum: 0, maximum: 30 })),
						shotsCount: t.Optional(t.Integer({ minimum: 0, maximum: 30 })),
					}),
				),
			}),
		},
	)

	// History of games the caller hosted or played in. Declared before the
	// parametric `/games/:roomCode` route so the literal path matches first.
	.get("/games/history", async ({ request }) => {
		const u = await requireUser(request);
		const rows = await db
			.selectDistinct({
				id: gameTable.id,
				roomCode: gameTable.roomCode,
				status: gameTable.status,
				hostId: gameTable.hostId,
				createdAt: gameTable.createdAt,
				startedAt: gameTable.startedAt,
				endedAt: gameTable.endedAt,
				quizId: gameTable.quizId,
				quizTitle: quizTable.title,
				ranking: gameResultTable.ranking,
			})
			.from(gameTable)
			.leftJoin(gamePlayerTable, eq(gamePlayerTable.gameId, gameTable.id))
			.leftJoin(gameResultTable, eq(gameResultTable.gameId, gameTable.id))
			.leftJoin(quizTable, eq(quizTable.id, gameTable.quizId))
			.where(
				and(
					eq(gameTable.status, "completed"),
					or(eq(gameTable.hostId, u.id), eq(gamePlayerTable.userId, u.id)),
				),
			)
			.orderBy(desc(gameTable.createdAt));
		return {
			games: rows.map((g) => {
				const ranking = (g.ranking as RankingEntry[] | null) ?? [];
				const winner = ranking.find((r) => r.rank === 1) ?? ranking[0] ?? null;
				return {
					id: g.id,
					roomCode: g.roomCode,
					status: g.status,
					role: g.hostId === u.id ? ("host" as const) : ("player" as const),
					createdAt: g.createdAt,
					startedAt: g.startedAt,
					endedAt: g.endedAt,
					quizId: g.quizId,
					quizTitle: g.quizTitle,
					winner: winner
						? { displayName: winner.displayName, score: winner.score }
						: null,
				};
			}),
		};
	})

	.get("/games/:roomCode/result", async ({ params }) => {
		const code = params.roomCode.toUpperCase();
		const rows = await db
			.select()
			.from(gameTable)
			.where(eq(gameTable.roomCode, code))
			.limit(1);
		const g = rows[0];
		// Mask-existence: only completed games surface here.
		if (!g || g.status !== "completed") notFound("Game not found");

		const persisted = (
			await db
				.select()
				.from(gameResultTable)
				.where(eq(gameResultTable.gameId, g.id))
				.limit(1)
		)[0];

		let ranking: RankingEntry[];
		if (persisted) {
			ranking = persisted.ranking as RankingEntry[];
		} else {
			// Persistence is fire-and-forget after the transition — there's a
			// tiny window where the game finished but the row hasn't landed yet.
			// In that window, fall back to the live driver's projection.
			const live = peekRoom(code)?.currentRanking() ?? null;
			if (!live) notFound("Game not found");
			ranking = live;
		}

		return {
			game: {
				roomCode: g.roomCode,
				hostId: g.hostId,
				startedAt: g.startedAt,
				endedAt: g.endedAt,
			},
			ranking,
		};
	})

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
