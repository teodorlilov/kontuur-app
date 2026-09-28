import { describe, expect, it } from 'vitest'
import { readErrorMessage } from '../read-error-message'

describe('readErrorMessage', () => {
  it('is the route’s own sentence', async () => {
    const res = Response.json({ error: 'All 120 images used' }, { status: 402 })
    expect(await readErrorMessage(res)).toBe('All 120 images used')
  })

  it('is null, never a throw, for a body that is not JSON, like an edge 502 HTML page', async () => {
    const res = new Response('<html>Bad gateway</html>', { status: 502 })
    expect(await readErrorMessage(res)).toBeNull()
  })

  it('is null for an empty body, and for JSON without a string error', async () => {
    expect(await readErrorMessage(new Response(null, { status: 500 }))).toBeNull()
    expect(await readErrorMessage(Response.json({ message: 'nope' }, { status: 400 }))).toBeNull()
    expect(
      await readErrorMessage(Response.json({ error: { code: 1 } }, { status: 400 }))
    ).toBeNull()
  })
})
