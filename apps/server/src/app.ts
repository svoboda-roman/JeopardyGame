import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { auth } from './auth.ts'
import { env } from './env.ts'

export const app = new Elysia()
  .use(
    cors({
      origin: env.webOrigin,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  )
  .get('/health', () => ({ ok: true }))
  .all('/api/auth/*', ({ request }) => auth.handler(request))
  .get('/me', async ({ request, set }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) {
      set.status = 401
      return { error: { code: 'unauthenticated', message: 'No session' } }
    }
    return { user: session.user, session: session.session }
  })

export type App = typeof app
