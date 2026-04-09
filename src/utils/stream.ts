/**
 * Reads an NDJSON response stream and calls onItem for each parsed JSON line.
 * Handles buffering across chunks, decoding, and reader cleanup.
 */
export async function readNDJSONStream<T>(
  response: Response,
  onItem: (item: T) => void,
): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        onItem(JSON.parse(line) as T)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
