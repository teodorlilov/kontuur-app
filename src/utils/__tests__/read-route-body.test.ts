import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readRouteBody } from '../read-route-body'

const linkSchema = z.object({ url: z.string(), postCount: z.number() })

describe('readRouteBody', () => {
  it('is the success body, as the schema parses it', async () => {
    const res = Response.json({ url: 'https://k/a/tok', postCount: 3, extra: true })
    await expect(readRouteBody(res, linkSchema, 'Failed')).resolves.toEqual({
      url: 'https://k/a/tok',
      postCount: 3,
    })
  })

  it('throws the route’s own sentence on a failure', async () => {
    const res = Response.json({ error: 'No posts scheduled that week' }, { status: 400 })
    await expect(readRouteBody(res, linkSchema, 'Failed')).rejects.toThrow(
      'No posts scheduled that week'
    )
  })

  it('throws the fallback, never a SyntaxError, when a failure carries no sentence (an edge 502’s HTML page)', async () => {
    const res = new Response('<html>Bad gateway</html>', { status: 502 })
    await expect(readRouteBody(res, linkSchema, 'Failed')).rejects.toThrow('Failed')
  })

  it('throws the fallback when a success is not the shape asked for, or not JSON', async () => {
    await expect(readRouteBody(Response.json({ ok: true }), linkSchema, 'Failed')).rejects.toThrow(
      'Failed'
    )
    await expect(
      readRouteBody(new Response('<html>ok</html>'), linkSchema, 'Failed')
    ).rejects.toThrow('Failed')
  })
})
