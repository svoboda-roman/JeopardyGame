import { describe, expect, it } from 'bun:test'
import { call } from './helpers.ts'

describe('OpenAPI documentation', () => {
  it('serves the JSON spec at /docs/json with our endpoints + tags', async () => {
    const res = await call('/docs/json')
    expect(res.status).toBe(200)
    const spec = (await res.json()) as {
      info: { title: string }
      paths: Record<string, Record<string, { tags?: string[] }>>
      tags: { name: string }[]
    }
    expect(spec.info.title).toBe('JeopardyGame API')
    // a sample of our routes — proves quiz, share, meta, and auth are all picked up
    expect(spec.paths['/health']?.get?.tags).toContain('meta')
    expect(spec.paths['/quizzes']?.get?.tags).toContain('quizzes')
    expect(spec.paths['/quizzes']?.post?.tags).toContain('quizzes')
    expect(spec.paths['/share/{token}']?.get?.tags).toContain('share')
    expect(spec.paths['/me']?.get?.tags).toContain('auth')
  })

  it('serves the Scalar UI at /docs', async () => {
    const res = await call('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toMatch(/text\/html/)
  })
})
