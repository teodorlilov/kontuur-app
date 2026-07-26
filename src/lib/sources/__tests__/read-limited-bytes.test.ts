import { describe, expect, it } from 'vitest'
import { readLimitedBytes } from '../read-limited-text'

function streamResponse(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(stream)
}

describe('readLimitedBytes', () => {
  it('returns the full body when under the cap', async () => {
    const buffer = await readLimitedBytes(streamResponse([new Uint8Array([1, 2, 3])]), 10)
    expect(buffer).toEqual(Buffer.from([1, 2, 3]))
  })

  it('joins multiple chunks in order', async () => {
    const res = streamResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4])])
    expect(await readLimitedBytes(res, 10)).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it('throws once the body exceeds the cap instead of truncating', async () => {
    const res = streamResponse([new Uint8Array(6), new Uint8Array(6)])
    await expect(readLimitedBytes(res, 10)).rejects.toThrow(/size limit/)
  })
})
