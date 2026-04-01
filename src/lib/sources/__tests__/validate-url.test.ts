import { describe, it, expect } from 'vitest'
import { validateSourceUrl } from '../validate-url'

describe('validateSourceUrl', () => {
  describe('valid URLs', () => {
    it('accepts HTTPS URLs', () => {
      expect(validateSourceUrl('https://example.com')).toBe(true)
    })

    it('accepts HTTP URLs', () => {
      expect(validateSourceUrl('http://blog.example.com/feed')).toBe(true)
    })

    it('accepts URLs with paths', () => {
      expect(validateSourceUrl('https://example.com/feed.xml')).toBe(true)
    })

    it('accepts URLs with query strings', () => {
      expect(validateSourceUrl('https://example.com/rss?format=xml')).toBe(true)
    })

    it('accepts 172.15.x (not in private range)', () => {
      expect(validateSourceUrl('http://172.15.0.1')).toBe(true)
    })

    it('accepts 172.32.x (not in private range)', () => {
      expect(validateSourceUrl('http://172.32.0.1')).toBe(true)
    })
  })

  describe('rejected protocols', () => {
    it('rejects FTP', () => {
      expect(validateSourceUrl('ftp://example.com')).toBe(false)
    })

    it('rejects javascript:', () => {
      expect(validateSourceUrl('javascript:alert(1)')).toBe(false)
    })

    it('rejects file:', () => {
      expect(validateSourceUrl('file:///etc/passwd')).toBe(false)
    })

    it('rejects data:', () => {
      expect(validateSourceUrl('data:text/html,<h1>hi</h1>')).toBe(false)
    })
  })

  describe('SSRF protection — blocked private IPs', () => {
    it('blocks localhost', () => {
      expect(validateSourceUrl('http://localhost:3000')).toBe(false)
    })

    it('blocks 127.0.0.1', () => {
      expect(validateSourceUrl('http://127.0.0.1')).toBe(false)
    })

    it('blocks 127.x.x.x range', () => {
      expect(validateSourceUrl('http://127.255.255.255')).toBe(false)
    })

    it('blocks 0.0.0.0', () => {
      expect(validateSourceUrl('http://0.0.0.0')).toBe(false)
    })

    it('blocks 10.x.x.x range', () => {
      expect(validateSourceUrl('http://10.0.0.1')).toBe(false)
    })

    it('blocks 10.255.255.255', () => {
      expect(validateSourceUrl('http://10.255.255.255')).toBe(false)
    })

    it('blocks 192.168.x.x range', () => {
      expect(validateSourceUrl('http://192.168.1.1')).toBe(false)
    })

    it('blocks 172.16.x.x (start of private range)', () => {
      expect(validateSourceUrl('http://172.16.0.1')).toBe(false)
    })

    it('blocks 172.31.x.x (end of private range)', () => {
      expect(validateSourceUrl('http://172.31.255.255')).toBe(false)
    })

    it('blocks 172.20.x.x (middle of private range)', () => {
      expect(validateSourceUrl('http://172.20.0.1')).toBe(false)
    })

    it('blocks 169.254.x.x link-local / cloud metadata', () => {
      expect(validateSourceUrl('http://169.254.169.254')).toBe(false)
      expect(validateSourceUrl('http://169.254.0.1')).toBe(false)
    })

    it('blocks IPv6 loopback ::1', () => {
      expect(validateSourceUrl('http://[::1]')).toBe(false)
    })

    it('blocks IPv6 private ranges (fc/fd)', () => {
      expect(validateSourceUrl('http://[fc00::1]')).toBe(false)
      expect(validateSourceUrl('http://[fd12::1]')).toBe(false)
    })

    it('blocks IPv6 link-local (fe80)', () => {
      expect(validateSourceUrl('http://[fe80::1]')).toBe(false)
    })
  })

  describe('malformed input', () => {
    it('rejects empty string', () => {
      expect(validateSourceUrl('')).toBe(false)
    })

    it('rejects non-URL string', () => {
      expect(validateSourceUrl('not-a-url')).toBe(false)
    })

    it('rejects URL without protocol', () => {
      expect(validateSourceUrl('example.com')).toBe(false)
    })
  })
})
