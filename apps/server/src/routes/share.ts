import { and, eq, isNull } from 'drizzle-orm'
import { Elysia } from 'elysia'
import { db } from '../db/client.ts'
import {
  quiz as quizTable,
  quizShare as quizShareTable,
  user as userTable,
  userProfile as userProfileTable,
} from '../db/schema.ts'
import { HttpError, notFound } from '../lib/auth-helpers.ts'

export const share = new Elysia({ tags: ['share'] })
  .onError(({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status
      return { error: { code: error.code, message: error.message } }
    }
  })
  .get('/share/:token', async ({ params }) => {
    const rows = await db
      .select({
        quizTitle: quizTable.title,
        ownerName: userProfileTable.displayName,
        userName: userTable.name,
      })
      .from(quizShareTable)
      .innerJoin(quizTable, eq(quizTable.id, quizShareTable.quizId))
      .innerJoin(userTable, eq(userTable.id, quizTable.ownerId))
      .leftJoin(userProfileTable, eq(userProfileTable.userId, userTable.id))
      .where(and(eq(quizShareTable.token, params.token), isNull(quizShareTable.revokedAt)))
      .limit(1)
    if (rows.length === 0) notFound('Share not found')
    const r = rows[0]!
    return {
      quizTitle: r.quizTitle,
      ownerDisplayName: r.ownerName ?? r.userName,
    }
  })
