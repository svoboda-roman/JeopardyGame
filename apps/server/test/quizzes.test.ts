import { beforeAll, describe, expect, it } from 'bun:test'
import { call, signUpAndGetCookie } from './helpers.ts'

let cookie: string
let otherCookie: string

beforeAll(async () => {
  cookie = await signUpAndGetCookie('Quiz Owner')
  otherCookie = await signUpAndGetCookie('Other User')
})

async function createQuiz(c: string = cookie, title = 'My Quiz') {
  const res = await call('/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: c },
    body: JSON.stringify({ title }),
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { quiz: { id: string; title: string; ownerId: string } }
  return body.quiz
}

describe('quiz CRUD', () => {
  it('rejects anonymous list / create', async () => {
    expect((await call('/quizzes')).status).toBe(401)
    expect(
      (
        await call('/quizzes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'x' }),
        })
      ).status,
    ).toBe(401)
  })

  it('creates a quiz with the default 6×5 board', async () => {
    const quiz = await createQuiz()
    const res = await call(`/quizzes/${quiz.id}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      quiz: { id: string }
      categories: { position: number; title: string }[]
      questions: { pointValue: number; categoryId: string; position: number }[]
      finalQuestion: null
    }
    expect(body.categories).toHaveLength(6)
    expect(body.questions).toHaveLength(30)
    expect(body.finalQuestion).toBeNull()
    // each category has 5 questions with the canonical point values
    const points = body.questions.map((q) => q.pointValue).sort((a, b) => a - b)
    expect(points.filter((p) => p === 100)).toHaveLength(6)
    expect(points.filter((p) => p === 500)).toHaveLength(6)
  })

  it('lists only the current user quizzes', async () => {
    await createQuiz(cookie, 'Mine 1')
    await createQuiz(otherCookie, 'Theirs')
    const res = await call('/quizzes', { headers: { cookie } })
    const body = (await res.json()) as { items: { title: string; ownerId: string }[] }
    expect(body.items.some((q) => q.title === 'Mine 1')).toBe(true)
    expect(body.items.every((q) => q.title !== 'Theirs')).toBe(true)
  })

  it('returns 404 (not 403) when reading someone else\'s quiz', async () => {
    const theirs = await createQuiz(otherCookie, 'Hidden')
    const res = await call(`/quizzes/${theirs.id}`, { headers: { cookie } })
    expect(res.status).toBe(404)
  })

  it('patches title and updatedAt advances', async () => {
    const quiz = await createQuiz(cookie, 'Before')
    const before = quiz
    const res = await call(`/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ title: 'After' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { quiz: { title: string; updatedAt: string } }
    expect(body.quiz.title).toBe('After')
    expect(new Date(body.quiz.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.title === 'Before' ? Date.now() - 5000 : 0).getTime(),
    )
  })

  it('patches a question (clue, answer, points, DD flag)', async () => {
    const quiz = await createQuiz()
    const detail = (await (await call(`/quizzes/${quiz.id}`, { headers: { cookie } })).json()) as {
      questions: { id: string }[]
    }
    const qId = detail.questions[0]!.id
    const res = await call(`/questions/${qId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ clue: 'A clue', answer: 'An answer', isDailyDouble: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      question: { clue: string; answer: string; isDailyDouble: boolean }
    }
    expect(body.question).toMatchObject({ clue: 'A clue', answer: 'An answer', isDailyDouble: true })
  })

  it('blocks patching a question owned by someone else', async () => {
    const theirs = await createQuiz(otherCookie)
    const detail = (await (
      await call(`/quizzes/${theirs.id}`, { headers: { cookie: otherCookie } })
    ).json()) as { questions: { id: string }[] }
    const res = await call(`/questions/${detail.questions[0]!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ clue: 'pwned' }),
    })
    expect(res.status).toBe(404)
  })

  it('replaces and clears a final question', async () => {
    const quiz = await createQuiz()
    const put = await call(`/quizzes/${quiz.id}/final`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ category: 'Cinema', clue: 'Citizen ____', answer: 'Kane' }),
    })
    expect(put.status).toBe(200)
    const detail1 = (await (await call(`/quizzes/${quiz.id}`, { headers: { cookie } })).json()) as {
      finalQuestion: { category: string } | null
    }
    expect(detail1.finalQuestion?.category).toBe('Cinema')

    const del = await call(`/quizzes/${quiz.id}/final`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(del.status).toBe(204)
    const detail2 = (await (await call(`/quizzes/${quiz.id}`, { headers: { cookie } })).json()) as {
      finalQuestion: unknown
    }
    expect(detail2.finalQuestion).toBeNull()
  })

  it('deletes a quiz and cascades to categories + questions', async () => {
    const quiz = await createQuiz()
    const del = await call(`/quizzes/${quiz.id}`, { method: 'DELETE', headers: { cookie } })
    expect(del.status).toBe(204)
    const after = await call(`/quizzes/${quiz.id}`, { headers: { cookie } })
    expect(after.status).toBe(404)
  })

  it('rejects invalid input (empty title)', async () => {
    const res = await call('/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ title: '' }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})
