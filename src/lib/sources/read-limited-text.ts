/** Read up to maxBytes from a fetch Response without buffering the full body. */
export async function readLimitedText(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return (await res.text()).slice(0, maxBytes)

  const decoder = new TextDecoder()
  const chunks: string[] = []
  let totalBytes = 0

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      chunks.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.cancel()
  }

  return chunks.join('').slice(0, maxBytes)
}
