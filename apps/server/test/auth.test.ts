import { describe, expect, it } from 'bun:test'
import { call, extractSessionCookie, uniqueEmail } from './helpers.ts'

describe('auth flow', () => {
  it('GET /me without a session returns 401', async () => {
    const res = await call('/me')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('unauthenticated')
  })

  it('sign-up creates a user, sets a session cookie, and /me returns the user', async () => {
    const email = uniqueEmail('signup')
    const password = 'correct-horse-battery-staple'

    const signUp = await call('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Sign Up' }),
    })
    expect(signUp.status).toBe(200)
    const cookie = extractSessionCookie(signUp)
    expect(cookie).not.toBeNull()

    const me = await call('/me', { headers: { cookie: cookie! } })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { user: { email: string; emailVerified: boolean } }
    expect(body.user.email).toBe(email)
    expect(body.user.emailVerified).toBe(false)
  })

  it('sign-in with the wrong password returns an error', async () => {
    const email = uniqueEmail('badpw')
    const password = 'correct-horse-battery-staple'

    const signUp = await call('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Bad Pw' }),
    })
    expect(signUp.status).toBe(200)

    const badLogin = await call('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'definitely-not-the-password' }),
    })
    // better-auth returns 401 for invalid credentials
    expect(badLogin.status).toBeGreaterThanOrEqual(400)
  })

  it('sign-out clears the session', async () => {
    const email = uniqueEmail('signout')
    const password = 'correct-horse-battery-staple'

    const signUp = await call('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Sign Out' }),
    })
    const cookie = extractSessionCookie(signUp)
    expect(cookie).not.toBeNull()

    const meOk = await call('/me', { headers: { cookie: cookie! } })
    expect(meOk.status).toBe(200)

    const signOut = await call('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie: cookie! },
    })
    expect(signOut.status).toBe(200)

    // Cookie is now invalid server-side
    const meAfter = await call('/me', { headers: { cookie: cookie! } })
    expect(meAfter.status).toBe(401)
  })
})
