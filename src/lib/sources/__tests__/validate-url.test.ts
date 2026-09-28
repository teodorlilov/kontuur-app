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
    if (host === 'nat64.attacker.com') return [{ address: '64:ff9b::a9fe:a9fe', family: 6 }]
    if (host === 'multicast.attacker.com') return [{ address: 'ff02::1', family: 6 }]
    if (host === 'localhost')
      return [
        { address: '127.0.0.1', family: 4 },
        { address: '::1', family: 6 },
      ]
    if (host === 'nxdomain.example') throw new Error('ENOTFOUND')
    return [{ address: '93.184.216.34', family: 4 }]
  }),
}))

import { arePublicAddresses, validateSourceUrl } from '../validate-url'

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
      expect(await validateSourceUrl('http://[2606:4700::1111]')).toBe(true)
    })

    it('accepts IPv6 literals carrying a public IPv4 address', async () => {
      expect(await validateSourceUrl('http://[64:ff9b::93.184.216.34]')).toBe(true)
      expect(await validateSourceUrl('http://[2002:5db8:d822::1]')).toBe(true)
      expect(await validateSourceUrl('http://[::93.184.216.34]')).toBe(true)
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

    it('blocks IPv6 multicast, site-local, discard-only and documentation literals', async () => {
      expect(await validateSourceUrl('http://[ff02::1]')).toBe(false)
      expect(await validateSourceUrl('http://[fec0::1]')).toBe(false)
      expect(await validateSourceUrl('http://[100::1]')).toBe(false)
      expect(await validateSourceUrl('http://[2001:db8::1]')).toBe(false)
    })

    it('blocks IPv6 literals carrying a private IPv4 address', async () => {
      expect(await validateSourceUrl('http://[::127.0.0.1]')).toBe(false)
      expect(await validateSourceUrl('http://[64:ff9b::7f00:1]')).toBe(false)
      expect(await validateSourceUrl('http://[64:ff9b::169.254.169.254]')).toBe(false)
      expect(await validateSourceUrl('http://[2002:7f00:1::1]')).toBe(false)
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

    it('accepts decimal encoding of a public IP (1572395042 = 93.184.216.34)', async () => {
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

    it('blocks hostnames resolving to NAT64 addresses carrying a private IPv4 address', async () => {
      expect(await validateSourceUrl('http://nat64.attacker.com')).toBe(false)
    })

    it('blocks hostnames resolving to IPv6 multicast', async () => {
      expect(await validateSourceUrl('http://multicast.attacker.com')).toBe(false)
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

describe('arePublicAddresses — the one address rule', () => {
  it('passes a non-empty answer of public addresses', () => {
    expect(arePublicAddresses(['93.184.216.34', '2606:4700::6810:84e5'])).toBe(true)
  })

  it('refuses an empty answer', () => {
    expect(arePublicAddresses([])).toBe(false)
  })

  it('refuses when any one address is private', () => {
    expect(arePublicAddresses(['93.184.216.34', '10.0.0.1'])).toBe(false)
  })

  it('judges upper-case IPv6 as its lower-case form', () => {
    expect(arePublicAddresses(['FD12::1'])).toBe(false)
    expect(arePublicAddresses(['::FFFF:127.0.0.1'])).toBe(false)
  })

  it.each([
    ['fc00::/7', 'fc00::', 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['fe80::/10', 'fe80::', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['fec0::/10', 'fec0::', 'feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['ff00::/8', 'ff00::', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['100::/64', '100::', '100::ffff:ffff:ffff:ffff'],
    ['2001:db8::/32', '2001:db8::', '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'],
  ])('refuses %s from its first address to its last', (_block, first, last) => {
    expect(arePublicAddresses([first])).toBe(false)
    expect(arePublicAddresses([last])).toBe(false)
  })

  it('passes the public addresses on either side of 2001:db8::/32', () => {
    expect(arePublicAddresses(['2001:db7:ffff:ffff:ffff:ffff:ffff:ffff'])).toBe(true)
    expect(arePublicAddresses(['2001:db9::'])).toBe(true)
  })

  it.each([
    ['::/96', '::7f00:1', '::5db8:d822'],
    ['::/96, dotted', '::127.0.0.1', '::93.184.216.34'],
    ['::ffff:0:0/96', '::ffff:a00:1', '::ffff:5db8:d822'],
    ['64:ff9b::/96', '64:ff9b::7f00:1', '64:ff9b::5db8:d822'],
    ['64:ff9b::/96, dotted', '64:ff9b::192.168.1.1', '64:ff9b::93.184.216.34'],
    ['2002::/16', '2002:7f00:1::1', '2002:5db8:d822::1'],
    ['2002::/16, cloud metadata', '2002:a9fe:a9fe::', '2002:5db8:d822:1:2:3:4:5'],
  ])('judges a %s address by the IPv4 address it carries', (_block, privateOne, publicOne) => {
    expect(arePublicAddresses([privateOne])).toBe(false)
    expect(arePublicAddresses([publicOne])).toBe(true)
  })

  it('refuses the unspecified and loopback addresses, which carry 0.0.0.0 and 0.0.0.1', () => {
    expect(arePublicAddresses(['::'])).toBe(false)
    expect(arePublicAddresses(['::1'])).toBe(false)
  })

  it('gives every spelling of one address the same answer', () => {
    expect(arePublicAddresses(['ff02:0:0:0:0:0:0:1'])).toBe(false)
    expect(arePublicAddresses(['FF02::1'])).toBe(false)
    expect(arePublicAddresses(['ff02::1%eth0'])).toBe(false)
    expect(arePublicAddresses(['0:0:0:0:0:0:0:1'])).toBe(false)
    expect(arePublicAddresses(['0064:ff9b:0000:0000:0000:0000:7f00:0001'])).toBe(false)
    expect(arePublicAddresses(['0:0:0:0:0:ffff:127.0.0.1'])).toBe(false)
  })

  it('passes ordinary public IPv6 addresses', () => {
    expect(arePublicAddresses(['2606:4700::1111'])).toBe(true)
    expect(arePublicAddresses(['2001:4860:4860::8888'])).toBe(true)
    expect(arePublicAddresses(['2a00:1450:4001:80b::200e'])).toBe(true)
  })
})
