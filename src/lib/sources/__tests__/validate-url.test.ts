import { describe, it, expect, vi } from 'vitest'

// Offline DNS: public hostnames resolve to a public IP; special names simulate
// attacker-controlled DNS pointing at internal addresses.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === 'internal.attacker.com') return [{ address: '10.0.0.1', family: 4 }]
    if (host === 'metadata.attacker.com') return [{ address: '169.254.169.254', family: 4 }]
    if (host === 'mixed.attacker.com')
      return [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ]
    if (host === 'v6private.attacker.com') return [{ address: 'fd12::1', family: 6 }]
    if (host === 'mapped.attacker.com') return [{ address: '::ffff:127.0.0.1', family: 6 }]
    if (host === 'localhost')
      return [
        { address: '127.0.0.1', family: 4 },
        { address: '::1', family: 6 },
      ]
    if (host === 'nxdomain.example') throw new Error('ENOTFOUND')
    return [{ address: '93.184.216.34', family: 4 }]
  }),
}))

import { validateSourceUrl } from '../validate-url'

describe('validateSourceUrl', () => {
  describe('valid URLs', () => {
    it('accepts HTTPS URLs', async () => {
      expect(await validateSourceUrl('https://example.com')).toBe(true)
    })

    it('accepts HTTP URLs', async () => {
      expect(await validateSourceUrl('http://blog.example.com/feed')).toBe(true)
    })

    it('accepts URLs with paths', async () => {
      expect(await validateSourceUrl('https://example.com/feed.xml')).toBe(true)
    })

    it('accepts URLs with query strings', async () => {
      expect(await validateSourceUrl('https://example.com/rss?format=xml')).toBe(true)
    })

    it('accepts 172.15.x (not in private range)', async () => {
      expect(await validateSourceUrl('http://172.15.0.1')).toBe(true)
    })

    it('accepts 172.32.x (not in private range)', async () => {
      expect(await validateSourceUrl('http://172.32.0.1')).toBe(true)
    })

    it('accepts public IPv6 literals', async () => {
      expect(await validateSourceUrl('http://[2606:4700::6810:84e5]')).toBe(true)
    })
  })

  describe('rejected protocols', () => {
    it('rejects FTP', async () => {
      expect(await validateSourceUrl('ftp://example.com')).toBe(false)
    })

    it('rejects javascript:', async () => {
      expect(await validateSourceUrl('javascript:alert(1)')).toBe(false)
    })

    it('rejects file:', async () => {
      expect(await validateSourceUrl('file:///etc/passwd')).toBe(false)
    })

    it('rejects data:', async () => {
      expect(await validateSourceUrl('data:text/html,<h1>hi</h1>')).toBe(false)
    })
  })

  describe('SSRF protection — blocked private IPs', () => {
    it('blocks localhost', async () => {
      expect(await validateSourceUrl('http://localhost:3000')).toBe(false)
    })

    it('blocks 127.0.0.1', async () => {
      expect(await validateSourceUrl('http://127.0.0.1')).toBe(false)
    })

    it('blocks 127.x.x.x range', async () => {
      expect(await validateSourceUrl('http://127.255.255.255')).toBe(false)
    })

    it('blocks 0.0.0.0', async () => {
      expect(await validateSourceUrl('http://0.0.0.0')).toBe(false)
    })

    it('blocks 10.x.x.x range', async () => {
      expect(await validateSourceUrl('http://10.0.0.1')).toBe(false)
      expect(await validateSourceUrl('http://10.255.255.255')).toBe(false)
    })

    it('blocks 192.168.x.x range', async () => {
      expect(await validateSourceUrl('http://192.168.1.1')).toBe(false)
    })

    it('blocks 172.16.0.0/12', async () => {
      expect(await validateSourceUrl('http://172.16.0.1')).toBe(false)
      expect(await validateSourceUrl('http://172.20.0.1')).toBe(false)
      expect(await validateSourceUrl('http://172.31.255.255')).toBe(false)
    })

    it('blocks 169.254.x.x link-local / cloud metadata', async () => {
      expect(await validateSourceUrl('http://169.254.169.254')).toBe(false)
      expect(await validateSourceUrl('http://169.254.0.1')).toBe(false)
    })

    it('blocks CGNAT 100.64.0.0/10', async () => {
      expect(await validateSourceUrl('http://100.64.0.1')).toBe(false)
      expect(await validateSourceUrl('http://100.127.255.255')).toBe(false)
    })

    it('accepts 100.x outside the CGNAT range', async () => {
      expect(await validateSourceUrl('http://100.63.0.1')).toBe(true)
      expect(await validateSourceUrl('http://100.128.0.1')).toBe(true)
    })

    it('blocks IPv6 loopback ::1', async () => {
      expect(await validateSourceUrl('http://[::1]')).toBe(false)
    })

    it('blocks IPv6 private ranges (fc/fd)', async () => {
      expect(await validateSourceUrl('http://[fc00::1]')).toBe(false)
      expect(await validateSourceUrl('http://[fd12::1]')).toBe(false)
    })

    it('blocks IPv6 link-local (fe80)', async () => {
      expect(await validateSourceUrl('http://[fe80::1]')).toBe(false)
    })

    it('blocks IPv4-mapped IPv6 loopback', async () => {
      expect(await validateSourceUrl('http://[::ffff:127.0.0.1]')).toBe(false)
      expect(await validateSourceUrl('http://[::ffff:10.0.0.1]')).toBe(false)
    })
  })

  describe('SSRF protection — numeric IP encodings', () => {
    it('blocks decimal-encoded loopback (2130706433 = 127.0.0.1)', async () => {
      expect(await validateSourceUrl('http://2130706433')).toBe(false)
    })

    it('blocks hex-encoded loopback (0x7f000001)', async () => {
      expect(await validateSourceUrl('http://0x7f000001')).toBe(false)
    })

    it('blocks octal-encoded loopback (0177.0.0.1)', async () => {
      expect(await validateSourceUrl('http://0177.0.0.1')).toBe(false)
    })

    it('blocks short-form loopback (127.1)', async () => {
      expect(await validateSourceUrl('http://127.1')).toBe(false)
    })

    it('accepts decimal encoding of a public IP', async () => {
      // 1572395042 = 93.184.216.34
      expect(await validateSourceUrl('http://1572395042')).toBe(true)
    })
  })

  describe('SSRF protection — DNS resolution', () => {
    it('blocks hostnames resolving to private IPs', async () => {
      expect(await validateSourceUrl('http://internal.attacker.com')).toBe(false)
    })

    it('blocks hostnames resolving to cloud metadata', async () => {
      expect(await validateSourceUrl('http://metadata.attacker.com')).toBe(false)
    })

    it('blocks hostnames where any resolved address is private', async () => {
      expect(await validateSourceUrl('http://mixed.attacker.com')).toBe(false)
    })

    it('blocks hostnames resolving to private IPv6', async () => {
      expect(await validateSourceUrl('http://v6private.attacker.com')).toBe(false)
    })

    it('blocks hostnames resolving to IPv4-mapped private IPv6', async () => {
      expect(await validateSourceUrl('http://mapped.attacker.com')).toBe(false)
    })

    it('rejects unresolvable hostnames', async () => {
      expect(await validateSourceUrl('http://nxdomain.example')).toBe(false)
    })
  })

  describe('malformed input', () => {
    it('rejects empty string', async () => {
      expect(await validateSourceUrl('')).toBe(false)
    })

    it('rejects non-URL string', async () => {
      expect(await validateSourceUrl('not-a-url')).toBe(false)
    })

    it('rejects URL without protocol', async () => {
      expect(await validateSourceUrl('example.com')).toBe(false)
    })
  })
})
