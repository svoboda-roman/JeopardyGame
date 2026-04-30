import { beforeAll, describe, expect, it } from 'bun:test'
import { call, signUpAndGetCookie } from './helpers.ts'

let cookie: string
let otherCookie: string

beforeAll(async () => {
  cookie = await signUpAndGetCookie('Share Owner')
  otherCookie = await signUpAndGetCookie('Share Stranger')
})

async function createQuiz(c: string = cookie, title = 'Shared Quiz') {
  const res = await call('/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: c },
    body: JSON.stringify({ title }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { quiz: { id: string } }).quiz
}

describe('quiz sharing', () => {
  it('owner creates a share token; second call is idempotent', async () => {
    const quiz = await createQuiz()
    const a = await call(`/quizzes/${quiz.id}/share`, {
      method: 'POST',
      headers: { cookie },
    })
    expect(a.status).toBe(200)
    const aBody = (await a.json()) as { share: { token: string; revokedAt: string | null } }
    expect(aBody.share.token).toBeTruthy()
    expect(aBody.share.revokedAt).toBeNull()

    const b = await call(`/quizzes/${quiz.id}/share`, {
      method: 'POST',
      headers: { cookie },
    })
    const bBody = (await b.json()) as { share: { token: string } }
    expect(bBody.share.token).toBe(aBody.share.token)
  })

  it('non-owner cannot create a share', async () => {
    const quiz = await createQuiz()
    const res = await call(`/quizzes/${quiz.id}/share`, {
      method: 'POST',
      headers: { cookie: otherCookie },
    })
    expect(res.status).toBe(404)
  })

  it('public GET /share/:token returns title + owner displayName', async () => {
    const quiz = await createQuiz(cookie, 'Visible Quiz')
    const created = (await (
      await call(`/quizzes/${quiz.id}/share`, { method: 'POST', headers: { cookie } })
    ).json()) as { share: { token: string } }

    const res = await call(`/share/${created.share.token}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { quizTitle: string; ownerDisplayName: string }
    expect(body.quizTitle).toBe('Visible Quiz')
    expect(body.ownerDisplayName).toBe('Share Owner')
  })

  it('revoking the share makes the token 404, and re-sharing issues a new token', async () => {
    const quiz = await createQuiz()
    const created = (await (
      await call(`/quizzes/${quiz.id}/share`, { method: 'POST', headers: { cookie } })
    ).json()) as { share: { token: string } }
    const oldToken = created.share.token

    const del = await call(`/quizzes/${quiz.id}/share`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(del.status).toBe(204)

    const stale = await call(`/share/${oldToken}`)
    expect(stale.status).toBe(404)

    const reshared = (await (
      await call(`/quizzes/${quiz.id}/share`, { method: 'POST', headers: { cookie } })
    ).json()) as { share: { token: string } }
    expect(reshared.share.token).not.toBe(oldToken)

    const live = await call(`/share/${reshared.share.token}`)
    expect(live.status).toBe(200)
  })

  it('GET /share with garbage token returns 404', async () => {
    const res = await call('/share/this-token-does-not-exist')
    expect(res.status).toBe(404)
  })
})
