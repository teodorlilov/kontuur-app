/** Read an NDJSON streaming `Response` line-by-line, invoking `onEvent` for each parsed JSON object.
 *  The client counterpart to `streamNdjson` — used by the visuals generation UIs. */
export async function readNdjson<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        onEvent(JSON.parse(line) as T)
      } catch {
        // ignore a partial/garbled line
      }
    }
  }
}
