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
    // Awaited so the connection is actually released before we return rather than during
    // some later tick, and `.catch` because a cancel that rejects here would otherwise
    // replace the error the try block was already throwing.
    await reader.cancel().catch(() => {})
  }

  return chunks.join('').slice(0, maxBytes)
}

/**
 * Read a fetch Response body into a Buffer, rejecting once it exceeds maxBytes. Unlike
 * readLimitedText, truncating image bytes would corrupt the file, so an oversize body throws.
 */
export async function readLimitedBytes(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader()
  if (!reader) {
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.byteLength > maxBytes) throw new Error('Image exceeds the size limit')
    return buffer
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) throw new Error('Image exceeds the size limit')
      chunks.push(Buffer.from(value))
    }
  } finally {
    // Awaited so the connection is actually released before we return rather than during
    // some later tick, and `.catch` because a cancel that rejects here would otherwise
    // replace the error the try block was already throwing.
    await reader.cancel().catch(() => {})
  }

  return Buffer.concat(chunks)
}
