import { and, asc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client.ts";
import {
	answerMedia as answerMediaTable,
	category as categoryTable,
	finalQuestion as finalQuestionTable,
	media as mediaTable,
	questionMedia as questionMediaTable,
	question as questionTable,
	quizShare as quizShareTable,
	quiz as quizTable,
} from "../db/schema.ts";
import { HttpError, notFound, requireUser } from "../lib/auth-helpers.ts";
import { generateShareToken } from "../lib/share-token.ts";

const MAX_MEDIA_PER_QUESTION = 6;

const POINT_VALUES = [100, 200, 300, 400, 500] as const;

async function ownedQuiz(quizId: string, userId: string) {
	const row = (
		await db
			.select()
			.from(quizTable)
			.where(and(eq(quizTable.id, quizId), eq(quizTable.ownerId, userId)))
			.limit(1)
	)[0];
	if (!row) notFound("Quiz not found");
	return row;
}

async function ownedCategory(categoryId: string, userId: string) {
	const row = (
		await db
			.select({ category: categoryTable, quiz: quizTable })
			.from(categoryTable)
			.innerJoin(quizTable, eq(quizTable.id, categoryTable.quizId))
			.where(
				and(eq(categoryTable.id, categoryId), eq(quizTable.ownerId, userId)),
			)
			.limit(1)
	)[0];
	if (!row) notFound("Category not found");
	return row.category;
}

async function ownedQuestion(questionId: string, userId: string) {
	const row = (
		await db
			.select({ question: questionTable })
			.from(questionTable)
			.innerJoin(categoryTable, eq(categoryTable.id, questionTable.categoryId))
			.innerJoin(quizTable, eq(quizTable.id, categoryTable.quizId))
			.where(
				and(eq(questionTable.id, questionId), eq(quizTable.ownerId, userId)),
			)
			.limit(1)
	)[0];
	if (!row) notFound("Question not found");
	return row.question;
}

export const quizzes = new Elysia({ tags: ["quizzes"] })
	.onError(({ error, set }) => {
		if (error instanceof HttpError) {
			set.status = error.status;
			return { error: { code: error.code, message: error.message } };
		}
	})

	// List the current user's quizzes
	.get("/quizzes", async ({ request }) => {
		const u = await requireUser(request);
		const items = await db
			.select()
			.from(quizTable)
			.where(eq(quizTable.ownerId, u.id))
			.orderBy(asc(quizTable.updatedAt));
		return { items };
	})

	// Create a quiz with the default 6×5 board.
	.post(
		"/quizzes",
		async ({ request, body, set }) => {
			const u = await requireUser(request);
			const created = await db.transaction(async (tx) => {
				const [q] = await tx
					.insert(quizTable)
					.values({
						ownerId: u.id,
						title: body.title,
						description: body.description ?? null,
					})
					.returning();
				if (!q) throw new Error("quiz insert returned no row");

				for (let cIdx = 0; cIdx < 6; cIdx++) {
					const [cat] = await tx
						.insert(categoryTable)
						.values({
							quizId: q.id,
							position: cIdx,
							title: `Category ${cIdx + 1}`,
						})
						.returning();
					if (!cat) throw new Error("category insert returned no row");

					const questions = POINT_VALUES.map((pv, qIdx) => ({
						categoryId: cat.id,
						position: qIdx,
						pointValue: pv,
						isDailyDouble: false,
						clue: "",
						answer: "",
					}));
					await tx.insert(questionTable).values(questions);
				}

				return q;
			});
			set.status = 201;
			return { quiz: created };
		},
		{
			body: t.Object({
				title: t.String({ minLength: 1, maxLength: 80 }),
				description: t.Optional(t.String({ maxLength: 1000 })),
			}),
		},
	)

	// Full quiz tree
	.get("/quizzes/:id", async ({ request, params }) => {
		const u = await requireUser(request);
		const q = await ownedQuiz(params.id, u.id);
		const cats = await db
			.select()
			.from(categoryTable)
			.where(eq(categoryTable.quizId, q.id))
			.orderBy(asc(categoryTable.position));
		const catIds = cats.map((c) => c.id);
		const questionRows = catIds.length
			? await db
					.select()
					.from(questionTable)
					.where(inArray(questionTable.categoryId, catIds))
					.orderBy(asc(questionTable.position))
			: [];

		const qIds = questionRows.map((q) => q.id);
		const [mediaJoins, answerMediaJoins] = qIds.length
			? await Promise.all([
					db
						.select({
							questionId: questionMediaTable.questionId,
							position: questionMediaTable.position,
							id: mediaTable.id,
							mime: mediaTable.mime,
						})
						.from(questionMediaTable)
						.innerJoin(
							mediaTable,
							eq(mediaTable.id, questionMediaTable.mediaId),
						)
						.where(inArray(questionMediaTable.questionId, qIds))
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
						.where(inArray(answerMediaTable.questionId, qIds))
						.orderBy(asc(answerMediaTable.position)),
				])
			: [[], []];

		const mediaByQ: Record<
			string,
			{ id: string; mime: string; url: string }[]
		> = {};
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

		const questions = questionRows.map((q) => ({
			...q,
			media: mediaByQ[q.id] ?? [],
			answerMedia: answerMediaByQ[q.id] ?? [],
		}));

		const final = (
			await db
				.select()
				.from(finalQuestionTable)
				.where(eq(finalQuestionTable.quizId, q.id))
				.limit(1)
		)[0];

		return {
			quiz: q,
			categories: cats,
			questions,
			finalQuestion: final ?? null,
		};
	})

	.patch(
		"/quizzes/:id",
		async ({ request, params, body }) => {
			const u = await requireUser(request);
			await ownedQuiz(params.id, u.id);
			const [updated] = await db
				.update(quizTable)
				.set({
					...(body.title !== undefined ? { title: body.title } : {}),
					...(body.description !== undefined
						? { description: body.description }
						: {}),
					...(body.settings !== undefined ? { settings: body.settings } : {}),
					updatedAt: new Date(),
				})
				.where(eq(quizTable.id, params.id))
				.returning();
			return { quiz: updated };
		},
		{
			body: t.Object({
				title: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
				description: t.Optional(
					t.Union([t.String({ maxLength: 1000 }), t.Null()]),
				),
				settings: t.Optional(
					t.Object({
						manualPoints: t.Optional(t.Boolean()),
						finalEnabled: t.Optional(t.Boolean()),
						readDelayMs: t.Optional(t.Integer({ minimum: 0, maximum: 10000 })),
					}),
				),
			}),
		},
	)

	.delete("/quizzes/:id", async ({ request, params, set }) => {
		const u = await requireUser(request);
		await ownedQuiz(params.id, u.id);
		await db.delete(quizTable).where(eq(quizTable.id, params.id));
		set.status = 204;
	})

	.patch(
		"/categories/:id",
		async ({ request, params, body }) => {
			const u = await requireUser(request);
			await ownedCategory(params.id, u.id);
			const [updated] = await db
				.update(categoryTable)
				.set({
					...(body.title !== undefined ? { title: body.title } : {}),
					...(body.position !== undefined ? { position: body.position } : {}),
				})
				.where(eq(categoryTable.id, params.id))
				.returning();
			return { category: updated };
		},
		{
			body: t.Object({
				title: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
				position: t.Optional(t.Integer({ minimum: 0 })),
			}),
		},
	)

	// Append a new category to a quiz with a fresh column of empty questions.
	.post("/quizzes/:id/categories", async ({ request, params, set }) => {
		const u = await requireUser(request);
		await ownedQuiz(params.id, u.id);

		const created = await db.transaction(async (tx) => {
			const existing = await tx
				.select({ position: categoryTable.position })
				.from(categoryTable)
				.where(eq(categoryTable.quizId, params.id));
			const nextPos = existing.reduce((m, r) => Math.max(m, r.position + 1), 0);
			const [cat] = await tx
				.insert(categoryTable)
				.values({
					quizId: params.id,
					position: nextPos,
					title: `Category ${nextPos + 1}`,
				})
				.returning();
			if (!cat) throw new Error("category insert returned no row");
			const questions = POINT_VALUES.map((pv, qIdx) => ({
				categoryId: cat.id,
				position: qIdx,
				pointValue: pv,
				isDailyDouble: false,
				clue: "",
				answer: "",
			}));
			await tx.insert(questionTable).values(questions);
			return cat;
		});
		set.status = 201;
		return { category: created };
	})

	// Delete a category and renumber the remaining ones to stay dense.
	.delete("/categories/:id", async ({ request, params, set }) => {
		const u = await requireUser(request);
		const cat = await ownedCategory(params.id, u.id);

		await db.transaction(async (tx) => {
			await tx.delete(categoryTable).where(eq(categoryTable.id, params.id));
			// Close the gap so positions stay 0..N-1; clients sort by position.
			// Two-pass with a temporary high range avoids violating the
			// (quiz_id, position) unique constraint mid-update.
			const remaining = await tx
				.select()
				.from(categoryTable)
				.where(eq(categoryTable.quizId, cat.quizId))
				.orderBy(asc(categoryTable.position));
			for (let i = 0; i < remaining.length; i++) {
				const r = remaining[i];
				if (!r) continue;
				await tx
					.update(categoryTable)
					.set({ position: 1000 + i })
					.where(eq(categoryTable.id, r.id));
			}
			for (let i = 0; i < remaining.length; i++) {
				const r = remaining[i];
				if (!r) continue;
				await tx
					.update(categoryTable)
					.set({ position: i })
					.where(eq(categoryTable.id, r.id));
			}
		});
		set.status = 204;
	})

	.patch(
		"/questions/:id",
		async ({ request, params, body }) => {
			const u = await requireUser(request);
			await ownedQuestion(params.id, u.id);

			for (const [fieldName, ids] of [
				["mediaIds", body.mediaIds],
				["answerMediaIds", body.answerMediaIds],
			] as const) {
				if (ids !== undefined && ids.length > 0) {
					const owned = await db
						.select({ id: mediaTable.id })
						.from(mediaTable)
						.where(
							and(inArray(mediaTable.id, ids), eq(mediaTable.ownerId, u.id)),
						);
					if (owned.length !== new Set(ids).size) {
						throw new HttpError(
							422,
							"invalid_media",
							`One or more ${fieldName} are not owned by you or do not exist`,
						);
					}
				}
			}

			const updated = await db.transaction(async (tx) => {
				const fields = {
					...(body.clue !== undefined ? { clue: body.clue } : {}),
					...(body.answer !== undefined ? { answer: body.answer } : {}),
					...(body.pointValue !== undefined
						? { pointValue: body.pointValue }
						: {}),
					...(body.isDailyDouble !== undefined
						? { isDailyDouble: body.isDailyDouble }
						: {}),
					...(body.youtubeId !== undefined
						? { youtubeId: body.youtubeId }
						: {}),
					...(body.answerYoutubeId !== undefined
						? { answerYoutubeId: body.answerYoutubeId }
						: {}),
					...(body.hostNotes !== undefined
						? { hostNotes: body.hostNotes }
						: {}),
					...(body.buzzWindowMs !== undefined
						? { buzzWindowMs: body.buzzWindowMs }
						: {}),
				};
				const [row] =
					Object.keys(fields).length > 0
						? await tx
								.update(questionTable)
								.set(fields)
								.where(eq(questionTable.id, params.id))
								.returning()
						: await tx
								.select()
								.from(questionTable)
								.where(eq(questionTable.id, params.id));

				if (body.mediaIds !== undefined) {
					await tx
						.delete(questionMediaTable)
						.where(eq(questionMediaTable.questionId, params.id));
					if (body.mediaIds.length > 0) {
						await tx.insert(questionMediaTable).values(
							body.mediaIds.map((mediaId, position) => ({
								questionId: params.id,
								mediaId,
								position,
							})),
						);
					}
				}

				if (body.answerMediaIds !== undefined) {
					await tx
						.delete(answerMediaTable)
						.where(eq(answerMediaTable.questionId, params.id));
					if (body.answerMediaIds.length > 0) {
						await tx.insert(answerMediaTable).values(
							body.answerMediaIds.map((mediaId, position) => ({
								questionId: params.id,
								mediaId,
								position,
							})),
						);
					}
				}

				return row;
			});

			return { question: updated };
		},
		{
			body: t.Object({
				clue: t.Optional(t.String({ maxLength: 500 })),
				answer: t.Optional(t.String({ maxLength: 200 })),
				pointValue: t.Optional(t.Integer({ minimum: 100, maximum: 2000 })),
				isDailyDouble: t.Optional(t.Boolean()),
				mediaIds: t.Optional(
					t.Array(t.String(), { maxItems: MAX_MEDIA_PER_QUESTION }),
				),
				answerMediaIds: t.Optional(
					t.Array(t.String(), { maxItems: MAX_MEDIA_PER_QUESTION }),
				),
				youtubeId: t.Optional(t.Union([t.String({ maxLength: 11 }), t.Null()])),
				answerYoutubeId: t.Optional(
					t.Union([t.String({ maxLength: 11 }), t.Null()]),
				),
				hostNotes: t.Optional(
					t.Union([t.String({ maxLength: 1000 }), t.Null()]),
				),
				buzzWindowMs: t.Optional(
					t.Union([t.Integer({ minimum: 0, maximum: 30000 }), t.Null()]),
				),
			}),
		},
	)

	.put(
		"/quizzes/:id/final",
		async ({ request, params, body }) => {
			const u = await requireUser(request);
			await ownedQuiz(params.id, u.id);
			// Replace any existing row.
			await db
				.delete(finalQuestionTable)
				.where(eq(finalQuestionTable.quizId, params.id));
			const [created] = await db
				.insert(finalQuestionTable)
				.values({ quizId: params.id, ...body })
				.returning();
			return { finalQuestion: created };
		},
		{
			body: t.Object({
				category: t.String({ minLength: 1, maxLength: 40 }),
				clue: t.String({ minLength: 1, maxLength: 500 }),
				answer: t.String({ minLength: 1, maxLength: 200 }),
			}),
		},
	)

	.delete("/quizzes/:id/final", async ({ request, params, set }) => {
		const u = await requireUser(request);
		await ownedQuiz(params.id, u.id);
		await db
			.delete(finalQuestionTable)
			.where(eq(finalQuestionTable.quizId, params.id));
		set.status = 204;
	})

	// ───── Sharing ─────

	.post("/quizzes/:id/share", async ({ request, params }) => {
		const u = await requireUser(request);
		await ownedQuiz(params.id, u.id);
		const existing = (
			await db
				.select()
				.from(quizShareTable)
				.where(eq(quizShareTable.quizId, params.id))
				.limit(1)
		)[0];
		if (existing && existing.revokedAt === null) {
			return { share: existing };
		}
		if (existing) {
			// revoked → un-revoke with new token (same row)
			const [updated] = await db
				.update(quizShareTable)
				.set({
					token: generateShareToken(),
					revokedAt: null,
					createdAt: new Date(),
				})
				.where(eq(quizShareTable.id, existing.id))
				.returning();
			return { share: updated };
		}
		const [share] = await db
			.insert(quizShareTable)
			.values({ quizId: params.id, token: generateShareToken() })
			.returning();
		return { share };
	})

	.delete("/quizzes/:id/share", async ({ request, params, set }) => {
		const u = await requireUser(request);
		await ownedQuiz(params.id, u.id);
		await db
			.update(quizShareTable)
			.set({ revokedAt: new Date() })
			.where(eq(quizShareTable.quizId, params.id));
		set.status = 204;
	});
