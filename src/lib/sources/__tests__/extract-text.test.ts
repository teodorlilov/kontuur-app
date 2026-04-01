import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractText } from '../extract-text'

const mockGetText = vi.fn().mockResolvedValue({ text: 'Extracted PDF text content here.' })
const mockDestroy = vi.fn().mockResolvedValue(undefined)

vi.mock('pdf-parse', () => {
  const MockPDFParse = vi.fn().mockImplementation(function () {
    return { getText: mockGetText, destroy: mockDestroy }
  })
  return { PDFParse: MockPDFParse }
})

beforeEach(() => {
  mockGetText.mockResolvedValue({ text: 'Extracted PDF text content here.' })
  mockDestroy.mockResolvedValue(undefined)
  vi.clearAllMocks()
})

describe('extractText', () => {
  describe('plain text files', () => {
    it('extracts text from a UTF-8 buffer', async () => {
      const buffer = Buffer.from('Hello world, this is plain text.', 'utf-8')
      const result = await extractText(buffer, 'text/plain')
      expect(result.text).toBe('Hello world, this is plain text.')
      expect(result.error).toBeUndefined()
    })

    it('normalizes whitespace', async () => {
      const buffer = Buffer.from('Hello   \n\n  world  \t here', 'utf-8')
      const result = await extractText(buffer, 'text/plain')
      expect(result.text).toBe('Hello world here')
    })

    it('truncates to 8000 chars', async () => {
      const longText = 'A'.repeat(10000)
      const buffer = Buffer.from(longText, 'utf-8')
      const result = await extractText(buffer, 'text/plain')
      expect(result.text.length).toBe(8000)
    })

    it('returns error for empty text content', async () => {
      const buffer = Buffer.from('   \n\n  ', 'utf-8')
      const result = await extractText(buffer, 'text/plain')
      expect(result.text).toBe('')
      expect(result.error).toBe('No text could be extracted from the file')
    })
  })

  describe('PDF files', () => {
    it('extracts text from a PDF buffer', async () => {
      const buffer = Buffer.from('fake pdf data')
      const result = await extractText(buffer, 'application/pdf')
      expect(result.text).toBe('Extracted PDF text content here.')
      expect(result.error).toBeUndefined()
    })

    it('calls destroy after extraction', async () => {
      const buffer = Buffer.from('test data')
      await extractText(buffer, 'application/pdf')
      expect(mockDestroy).toHaveBeenCalled()
    })

    it('handles PDF parse errors gracefully', async () => {
      mockGetText.mockRejectedValueOnce(new Error('Corrupt PDF'))
      const buffer = Buffer.from('corrupt')
      const result = await extractText(buffer, 'application/pdf')
      expect(result.text).toBe('')
      expect(result.error).toBe('Corrupt PDF')
    })

    it('truncates long PDF text to 8000 chars', async () => {
      mockGetText.mockResolvedValueOnce({ text: 'B'.repeat(10000) })
      const buffer = Buffer.from('pdf')
      const result = await extractText(buffer, 'application/pdf')
      expect(result.text.length).toBe(8000)
    })

    it('returns error when PDF has no extractable text', async () => {
      mockGetText.mockResolvedValueOnce({ text: '' })
      const buffer = Buffer.from('empty pdf')
      const result = await extractText(buffer, 'application/pdf')
      expect(result.text).toBe('')
      expect(result.error).toBe('No text could be extracted from the file')
    })
  })

  describe('unsupported types', () => {
    it('returns error for unsupported MIME type', async () => {
      const buffer = Buffer.from('data')
      const result = await extractText(buffer, 'image/png')
      expect(result.text).toBe('')
      expect(result.error).toBe('Unsupported file type: image/png')
    })

    it('returns error for application/json', async () => {
      const buffer = Buffer.from('{}')
      const result = await extractText(buffer, 'application/json')
      expect(result.text).toBe('')
      expect(result.error).toContain('Unsupported file type')
    })
  })
})
