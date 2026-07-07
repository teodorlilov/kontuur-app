import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Validates a user-supplied URL before the server fetches it (SSRF protection).
 * Rejects non-http(s) schemes, private/loopback/link-local IPs in any encoding
 * (dotted, decimal, hex, octal, IPv6, IPv4-mapped IPv6), and hostnames that
 * resolve to private addresses.
 */
export async function validateSourceUrl(url: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false

  // URL.hostname wraps IPv6 literals in brackets
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (isIP(host)) return !isPrivateAddress(host)

  // Legacy numeric IPv4 forms getaddrinfo would accept: http://2130706433,
  // http://0x7f000001, http://0177.0.0.1, http://127.1
  const legacy = parseLegacyIPv4(host)
  if (legacy) return !isPrivateAddress(legacy)

  // Hostname — resolve it and verify every address it points at, so a domain
  // with an A record for 10.0.0.1 can't smuggle a request into the network
  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.length === 0) return false
    return addresses.every((a) => !isPrivateAddress(a.address.toLowerCase()))
  } catch {
    return false
  }
}

function isPrivateAddress(addr: string): boolean {
  const version = isIP(addr)
  if (version === 4) {
    const octets = addr.split('.').map(Number)
    return isPrivateIPv4(octets as [number, number, number, number])
  }
  if (version === 6) return isPrivateIPv6(addr)
  return true // not a recognizable IP — refuse to fetch
}

function isPrivateIPv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return true // "this net", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private 172.16.0.0/12
  if (a === 192 && b === 168) return true // private
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking 198.18.0.0/15
  if (a >= 224) return true // multicast, reserved, broadcast
  return false
}

function isPrivateIPv6(addr: string): boolean {
  if (addr === '::' || addr === '::1') return true // unspecified, loopback
  if (/^f[cd]/.test(addr)) return true // ULA fc00::/7
  if (/^fe[89ab]/.test(addr)) return true // link-local fe80::/10
  // IPv4-mapped — apply the IPv4 rules to the embedded address. The WHATWG URL
  // parser normalizes these to hex groups (::ffff:7f00:1), DNS results may use
  // the dotted form (::ffff:127.0.0.1) — handle both.
  const mapped = addr.match(/^(?:0:0:0:0:0|::)ffff:([0-9a-f:.]+)$/)
  if (mapped) {
    const embedded = extractMappedIPv4(mapped[1]!)
    if (!embedded) return true // unparseable — refuse to fetch
    return isPrivateIPv4(embedded)
  }
  return false
}

/** Converts the tail of a ::ffff: address (dotted quad or 1–2 hex groups) to octets. */
function extractMappedIPv4(tail: string): [number, number, number, number] | null {
  if (tail.includes('.')) {
    const octets = tail.split('.').map(Number)
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n > 255)) return null
    return octets as [number, number, number, number]
  }
  const groups = tail.split(':')
  if (groups.length > 2 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  const value =
    groups.length === 2
      ? parseInt(groups[0]!, 16) * 65_536 + parseInt(groups[1]!, 16)
      : parseInt(groups[0]!, 16)
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

/**
 * Parses inet_aton-style numeric hosts (1–4 dot-separated decimal/hex/octal
 * parts) into dotted-quad form. Returns null for anything non-numeric so
 * regular hostnames fall through to DNS resolution.
 */
function parseLegacyIPv4(host: string): string | null {
  const parts = host.split('.')
  if (parts.length === 0 || parts.length > 4) return null

  const nums: number[] = []
  for (const part of parts) {
    if (!/^(0x[0-9a-f]+|\d+)$/.test(part)) return null
    const n = part.startsWith('0x')
      ? parseInt(part, 16)
      : part.length > 1 && part.startsWith('0')
        ? parseInt(part, 8)
        : parseInt(part, 10)
    if (Number.isNaN(n) || n < 0) return null
    nums.push(n)
  }

  let value: number
  if (nums.length === 1) value = nums[0]!
  else if (nums.length === 2) value = nums[0]! * 2 ** 24 + nums[1]!
  else if (nums.length === 3) value = nums[0]! * 2 ** 24 + nums[1]! * 2 ** 16 + nums[2]!
  else {
    if (nums.some((n) => n > 255)) return null
    value = nums[0]! * 2 ** 24 + nums[1]! * 2 ** 16 + nums[2]! * 2 ** 8 + nums[3]!
  }
  if (value > 0xffffffff) return null

  return `${(value >>> 24) & 255}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`
}
