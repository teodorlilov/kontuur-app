/**
 * Build an NDJSON streaming `Response`: `produce(send)` enqueues one JSON event per line. Shared by the
 * per-post and batch visuals routes so progress streams to the client as each backdrop lands.
 */
export function streamNdjson<T>(produce: (send: (event: T) => void) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: T) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        await produce(send)
      } catch (err) {
        console.error('[streamNdjson] producer error:', err)
        send({ type: 'error', message: 'stream failed' } as unknown as T)
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
