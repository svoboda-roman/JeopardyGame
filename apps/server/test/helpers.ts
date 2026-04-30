import { app } from '../src/app.ts'

/**
 * Send a Request directly to the in-process Elysia app — no port,
 * no network. Faster and isolated from the dev server.
 */
export function call(input: string, init?: RequestInit): Promise<Response> {
  const url = input.startsWith('http') ? input : `http://localhost${input}`
  return app.handle(new Request(url, init))
}

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

export async function signUpAndGetCookie(name = 'Test User'): Promise<string> {
  const email = uniqueEmail('user')
  const res = await call('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery-staple', name }),
  })
  if (!res.ok) throw new Error(`signUp failed: ${res.status} ${await res.text()}`)
  const cookie = extractSessionCookie(res)
  if (!cookie) throw new Error('signUp did not return a session cookie')
  return cookie
}

export function extractSessionCookie(res: Response): string | null {
  // bun's Response uses native Headers — getSetCookie is the standard way
  const setCookies =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get('set-cookie') ?? '']
  for (const c of setCookies) {
    const match = c.match(/(better-auth\.session_token=[^;]+)/)
    if (match) return match[1] ?? null
  }
  return null
}
