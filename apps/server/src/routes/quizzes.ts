import { and, asc, eq, inArray } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { db } from '../db/client.ts'
import {
  category as categoryTable,
  finalQuestion as finalQuestionTable,
  question as questionTable,
  quiz as quizTable,
  quizShare as quizShareTable,
} from '../db/schema.ts'
import { HttpError, notFound, requireUser } from '../lib/auth-helpers.ts'
import { generateShareToken } from '../lib/share-token.ts'

const POINT_VALUES = [100, 200, 300, 400, 500] as const

async function ownedQuiz(quizId: string, userId: string) {
  const rows = await db
    .select()
    .from(quizTable)
    .where(and(eq(quizTable.id, quizId), eq(quizTable.ownerId, userId)))
    .limit(1)
  if (rows.length === 0) notFound('Quiz not found')
  return rows[0]!
}

async function ownedCategory(categoryId: string, userId: string) {
  const rows = await db
    .select({ category: categoryTable, quiz: quizTable })
    .from(categoryTable)
    .innerJoin(quizTable, eq(quizTable.id, categoryTable.quizId))
    .where(and(eq(categoryTable.id, categoryId), eq(quizTable.ownerId, userId)))
    .limit(1)
  if (rows.length === 0) notFound('Category not found')
  return rows[0]!.category
}

async function ownedQuestion(questionId: string, userId: string) {
  const rows = await db
    .select({ question: questionTable })
    .from(questionTable)
    .innerJoin(categoryTable, eq(categoryTable.id, questionTable.categoryId))
    .innerJoin(quizTable, eq(quizTable.id, categoryTable.quizId))
    .where(and(eq(questionTable.id, questionId), eq(quizTable.ownerId, userId)))
    .limit(1)
  if (rows.length === 0) notFound('Question not found')
  return rows[0]!.question
}

export const quizzes = new Elysia({ tags: ['quizzes'] })
  .onError(({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status
      return { error: { code: error.code, message: error.message } }
    }
  })

  // List the current user's quizzes
  .get('/quizzes', async ({ request }) => {
    const u = await requireUser(request)
    const items = await db
      .select()
      .from(quizTable)
      .where(eq(quizTable.ownerId, u.id))
      .orderBy(asc(quizTable.updatedAt))
    return { items }
  })

  // Create a quiz with the default 6×5 board.
  .post(
    '/quizzes',
    async ({ request, body, set }) => {
      const u = await requireUser(request)
      const created = await db.transaction(async (tx) => {
        const [q] = await tx
          .insert(quizTable)
          .values({ ownerId: u.id, title: body.title, description: body.description ?? null })
          .returning()
        if (!q) throw new Error('quiz insert returned no row')

        for (let cIdx = 0; cIdx < 6; cIdx++) {
          const [cat] = await tx
            .insert(categoryTable)
            .values({ quizId: q.id, position: cIdx, title: `Category ${cIdx + 1}` })
            .returning()
          if (!cat) throw new Error('category insert returned no row')

          const questions = POINT_VALUES.map((pv, qIdx) => ({
            categoryId: cat.id,
            position: qIdx,
            pointValue: pv,
            isDailyDouble: false,
            clue: '',
            answer: '',
          }))
          await tx.insert(questionTable).values(questions)
        }

        return q
      })
      set.status = 201
      return { quiz: created }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 80 }),
        description: t.Optional(t.String({ maxLength: 1000 })),
      }),
    },
  )

  // Full quiz tree
  .get('/quizzes/:id', async ({ request, params }) => {
    const u = await requireUser(request)
    const q = await ownedQuiz(params.id, u.id)
    const cats = await db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.quizId, q.id))
      .orderBy(asc(categoryTable.position))
    const catIds = cats.map((c) => c.id)
    const questions = catIds.length
      ? await db
          .select()
          .from(questionTable)
          .where(inArray(questionTable.categoryId, catIds))
          .orderBy(asc(questionTable.position))
      : []

    const final = (
      await db.select().from(finalQuestionTable).where(eq(finalQuestionTable.quizId, q.id)).limit(1)
    )[0]

    return {
      quiz: q,
      categories: cats,
      questions,
      finalQuestion: final ?? null,
    }
  })

  .patch(
    '/quizzes/:id',
    async ({ request, params, body }) => {
      const u = await requireUser(request)
      await ownedQuiz(params.id, u.id)
      const [updated] = await db
        .update(quizTable)
        .set({
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          updatedAt: new Date(),
        })
        .where(eq(quizTable.id, params.id))
        .returning()
      return { quiz: updated }
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
        description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
      }),
    },
  )

  .delete('/quizzes/:id', async ({ request, params, set }) => {
    const u = await requireUser(request)
    await ownedQuiz(params.id, u.id)
    await db.delete(quizTable).where(eq(quizTable.id, params.id))
    set.status = 204
  })

  .patch(
    '/categories/:id',
    async ({ request, params, body }) => {
      const u = await requireUser(request)
      await ownedCategory(params.id, u.id)
      const [updated] = await db
        .update(categoryTable)
        .set({
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.position !== undefined ? { position: body.position } : {}),
        })
        .where(eq(categoryTable.id, params.id))
        .returning()
      return { category: updated }
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
        position: t.Optional(t.Integer({ minimum: 0, maximum: 5 })),
      }),
    },
  )

  .patch(
    '/questions/:id',
    async ({ request, params, body }) => {
      const u = await requireUser(request)
      await ownedQuestion(params.id, u.id)
      const [updated] = await db
        .update(questionTable)
        .set({
          ...(body.clue !== undefined ? { clue: body.clue } : {}),
          ...(body.answer !== undefined ? { answer: body.answer } : {}),
          ...(body.pointValue !== undefined ? { pointValue: body.pointValue } : {}),
          ...(body.isDailyDouble !== undefined ? { isDailyDouble: body.isDailyDouble } : {}),
        })
        .where(eq(questionTable.id, params.id))
        .returning()
      return { question: updated }
    },
    {
      body: t.Object({
        clue: t.Optional(t.String({ maxLength: 500 })),
        answer: t.Optional(t.String({ maxLength: 200 })),
        pointValue: t.Optional(t.Integer({ minimum: 100, maximum: 2000 })),
        isDailyDouble: t.Optional(t.Boolean()),
      }),
    },
  )

  .put(
    '/quizzes/:id/final',
    async ({ request, params, body }) => {
      const u = await requireUser(request)
      await ownedQuiz(params.id, u.id)
      // Replace any existing row.
      await db.delete(finalQuestionTable).where(eq(finalQuestionTable.quizId, params.id))
      const [created] = await db
        .insert(finalQuestionTable)
        .values({ quizId: params.id, ...body })
        .returning()
      return { finalQuestion: created }
    },
    {
      body: t.Object({
        category: t.String({ minLength: 1, maxLength: 40 }),
        clue: t.String({ minLength: 1, maxLength: 500 }),
        answer: t.String({ minLength: 1, maxLength: 200 }),
      }),
    },
  )

  .delete('/quizzes/:id/final', async ({ request, params, set }) => {
    const u = await requireUser(request)
    await ownedQuiz(params.id, u.id)
    await db.delete(finalQuestionTable).where(eq(finalQuestionTable.quizId, params.id))
    set.status = 204
  })

  // ───── Sharing ─────

  .post('/quizzes/:id/share', async ({ request, params }) => {
    const u = await requireUser(request)
    await ownedQuiz(params.id, u.id)
    const existing = await db
      .select()
      .from(quizShareTable)
      .where(eq(quizShareTable.quizId, params.id))
      .limit(1)
    if (existing.length > 0 && existing[0]!.revokedAt === null) {
      return { share: existing[0]! }
    }
    if (existing.length > 0) {
      // revoked → un-revoke with new token (same row)
      const [updated] = await db
        .update(quizShareTable)
        .set({ token: generateShareToken(), revokedAt: null, createdAt: new Date() })
        .where(eq(quizShareTable.id, existing[0]!.id))
        .returning()
      return { share: updated }
    }
    const [share] = await db
      .insert(quizShareTable)
      .values({ quizId: params.id, token: generateShareToken() })
      .returning()
    return { share }
  })

  .delete('/quizzes/:id/share', async ({ request, params, set }) => {
    const u = await requireUser(request)
    await ownedQuiz(params.id, u.id)
    await db
      .update(quizShareTable)
      .set({ revokedAt: new Date() })
      .where(eq(quizShareTable.quizId, params.id))
    set.status = 204
  })
