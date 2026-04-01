import { PDFParse } from 'pdf-parse'

const MAX_CHARS = 8000

/**
 * Extract text content from a file buffer.
 * Supports PDF and plain text files.
 * Output is truncated to ~8000 chars to keep prompt context manageable.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; error?: string }> {
  try {
    let text: string

    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      text = result.text
      await parser.destroy()
    } else if (mimeType === 'text/plain') {
      text = buffer.toString('utf-8')
    } else {
      return { text: '', error: `Unsupported file type: ${mimeType}` }
    }

    // Normalize whitespace and truncate
    text = text.replace(/\s+/g, ' ').trim()
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS)
    }

    if (!text) {
      return { text: '', error: 'No text could be extracted from the file' }
    }

    return { text }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error'
    return { text: '', error: message }
  }
}
