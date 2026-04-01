import { describe, it, expect } from 'vitest'
import { validateUpload, getFileExtension } from '../validate-upload'

describe('validateUpload', () => {
  // Positive tests
  it('accepts a valid PDF file with label', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 1024, name: 'doc.pdf' },
      'My PDF'
    )
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('accepts a valid TXT file with label', () => {
    const result = validateUpload(
      { type: 'text/plain', size: 500, name: 'notes.txt' },
      'Notes'
    )
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('accepts a file exactly at 10MB limit', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 10 * 1024 * 1024, name: 'big.pdf' },
      'Big file'
    )
    expect(result.valid).toBe(true)
  })

  it('accepts label with surrounding whitespace (trims it)', () => {
    const result = validateUpload(
      { type: 'text/plain', size: 100, name: 'a.txt' },
      '  My Label  '
    )
    expect(result.valid).toBe(true)
  })

  // Negative tests — no file
  it('rejects when file is null', () => {
    const result = validateUpload(null, 'Label')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('No file provided')
  })

  // Negative tests — label
  it('rejects when label is null', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 100, name: 'a.pdf' },
      null
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Label is required')
  })

  it('rejects when label is undefined', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 100, name: 'a.pdf' },
      undefined
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Label is required')
  })

  it('rejects when label is empty string', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 100, name: 'a.pdf' },
      ''
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Label is required')
  })

  it('rejects when label is only whitespace', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 100, name: 'a.pdf' },
      '   '
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Label is required')
  })

  // Negative tests — MIME type
  it('rejects image/png', () => {
    const result = validateUpload(
      { type: 'image/png', size: 100, name: 'pic.png' },
      'Image'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Only PDF and TXT files are supported')
  })

  it('rejects application/json', () => {
    const result = validateUpload(
      { type: 'application/json', size: 100, name: 'data.json' },
      'JSON'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Only PDF and TXT files are supported')
  })

  it('rejects application/zip', () => {
    const result = validateUpload(
      { type: 'application/zip', size: 100, name: 'archive.zip' },
      'Archive'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Only PDF and TXT files are supported')
  })

  it('rejects text/html', () => {
    const result = validateUpload(
      { type: 'text/html', size: 100, name: 'page.html' },
      'Page'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Only PDF and TXT files are supported')
  })

  it('rejects application/octet-stream', () => {
    const result = validateUpload(
      { type: 'application/octet-stream', size: 100, name: 'file.bin' },
      'Binary'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Only PDF and TXT files are supported')
  })

  // Negative tests — file size
  it('rejects file over 10MB', () => {
    const result = validateUpload(
      { type: 'application/pdf', size: 10 * 1024 * 1024 + 1, name: 'huge.pdf' },
      'Huge file'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File must be under 10MB')
  })

  it('rejects very large file', () => {
    const result = validateUpload(
      { type: 'text/plain', size: 100 * 1024 * 1024, name: 'massive.txt' },
      'Massive'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File must be under 10MB')
  })

  // Validation order: file null checked before label
  it('checks file presence before label', () => {
    const result = validateUpload(null, null)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('No file provided')
  })

  // Validation order: label checked before type
  it('checks label before MIME type', () => {
    const result = validateUpload(
      { type: 'image/png', size: 100, name: 'pic.png' },
      ''
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Label is required')
  })
})

describe('getFileExtension', () => {
  it('extracts pdf extension', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf')
  })

  it('extracts txt extension', () => {
    expect(getFileExtension('notes.txt')).toBe('txt')
  })

  it('extracts last extension from double-dotted name', () => {
    expect(getFileExtension('my.report.pdf')).toBe('pdf')
  })

  it('returns the name itself when no dot present', () => {
    expect(getFileExtension('README')).toBe('README')
  })

  it('handles dotfile', () => {
    expect(getFileExtension('.gitignore')).toBe('gitignore')
  })
})
