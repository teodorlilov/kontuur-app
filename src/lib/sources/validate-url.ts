import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Validates a user-supplied URL before the server fetches it (SSRF protection): http(s) only, and
 * the host must pass `arePublicAddresses` in any encoding — an IPv6 literal without its brackets,
 * the legacy numeric IPv4 forms getaddrinfo would accept (http://2130706433, http://0x7f000001,
 * http://0177.0.0.1, http://127.1), or every address a hostname resolves to. A pass describes what
 * the name resolves to now: a fetch that resolves it again can land elsewhere (DNS rebinding),
 * which is why the brand capture connects only through its egress proxy
 * (src/lib/visual/capture/egress-proxy.ts).
 */
export async function validateSourceUrl(url: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (isIP(host)) return !isPrivateAddress(host)

  const legacy = parseLegacyIPv4(host)
  if (legacy) return !isPrivateAddress(legacy)

  try {
    const addresses = await lookup(host, { all: true })
    return arePublicAddresses(addresses.map((a) => a.address))
  } catch {
    return false
  }
}

/**
 * The one public-address rule, also held by the brand capture's egress proxy
 * (src/lib/visual/capture/egress-proxy.ts) to the addresses it connects to: true when there is at
 * least one address and none is refused. It judges addresses only, never ports. Refused: any string
 * `isIP` does not read as an address, the IPv4 blocks in `isPrivateIPv4`, the IPv6 blocks in
 * `REFUSED_IPV6_PREFIXES`, and an address in an `IPV4_CARRYING_PREFIXES` block whose IPv4 address
 * is refused (one carrying a public IPv4 address passes). An IPv6 address is judged by its 128
 * bits, so every way of writing it gets the same answer.
 */
export function arePublicAddresses(addresses: readonly string[]): boolean {
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.toLowerCase()))
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

/**
 * The IPv6 blocks refused outright, as the leading bits they fix: fc00::/7 (unique-local),
 * fe80::/10 (link-local), 100::/64 (discard-only) and 2001:db8::/32 (documentation) from
 * iana.org/assignments/iana-ipv6-special-registry; ff00::/8 (multicast) and fec0::/10 (site-local,
 * deprecated) from iana.org/assignments/ipv6-address-space.
 */
const REFUSED_IPV6_PREFIXES = [
  'fc00::/7',
  'fe80::/10',
  'fec0::/10',
  'ff00::/8',
  '100::/64',
  '2001:db8::/32',
].map(parsePrefixBits)

/**
 * The IPv6 blocks that carry an IPv4 address, as the leading bits they fix and the bit that
 * address starts at: ::/96 (IPv4-compatible, RFC 4291 §2.5.5.1 — so :: and ::1 carry 0.0.0.0 and
 * 0.0.0.1 and are refused), and ::ffff:0:0/96 (IPv4-mapped), 64:ff9b::/96 (NAT64) and 2002::/16
 * (6to4) from iana.org/assignments/iana-ipv6-special-registry.
 */
const IPV4_CARRYING_PREFIXES = [
  { prefix: parsePrefixBits('::/96'), ipv4At: 96 },
  { prefix: parsePrefixBits('::ffff:0:0/96'), ipv4At: 96 },
  { prefix: parsePrefixBits('64:ff9b::/96'), ipv4At: 96 },
  { prefix: parsePrefixBits('2002::/16'), ipv4At: 16 },
]

/**
 * The IPv6 half of `arePublicAddresses`: an address in an `IPV4_CARRYING_PREFIXES`
 * block takes the IPv4 rule's answer for the address it carries; any other is refused when it
 * starts with one of `REFUSED_IPV6_PREFIXES`.
 */
function isPrivateIPv6(addr: string): boolean {
  const bits = parseIPv6Bits(addr)
  const carrier = IPV4_CARRYING_PREFIXES.find(({ prefix }) => bits.startsWith(prefix))
  if (carrier) return isPrivateIPv4(readIPv4Octets(bits, carrier.ipv4At))
  return REFUSED_IPV6_PREFIXES.some((prefix) => bits.startsWith(prefix))
}

/**
 * An IPv6 address as its 128 bits, a string of 0s and 1s, from any text `isIP` reads as version
 * 6: compressed with `::` or written out, with leading zeros, ending in a dotted IPv4 address,
 * or carrying a `%zone`, which is dropped.
 */
function parseIPv6Bits(addr: string): string {
  const [head = '', tail] = addr.replace(/%.*$/, '').split('::')
  const front = parseGroupBits(head)
  const back = parseGroupBits(tail ?? '')
  const gap = tail === undefined ? '' : '0'.repeat(128 - front.length - back.length)
  return front + gap + back
}

/** The bits of one side of an IPv6 address's `::`: 16 per hex group, 32 for a dotted IPv4 tail. */
function parseGroupBits(text: string): string {
  if (text === '') return ''
  return text
    .split(':')
    .map((part) =>
      part.includes('.')
        ? part
            .split('.')
            .map((octet) => Number(octet).toString(2).padStart(8, '0'))
            .join('')
        : parseInt(part, 16).toString(2).padStart(16, '0')
    )
    .join('')
}

/** The leading bits an IPv6 CIDR block such as `fc00::/7` fixes. */
function parsePrefixBits(cidr: string): string {
  const [address = '', length = ''] = cidr.split('/')
  return parseIPv6Bits(address).slice(0, Number(length))
}

/** The four octets of the 32-bit IPv4 address that starts at bit `start` of an IPv6 address. */
function readIPv4Octets(bits: string, start: number): [number, number, number, number] {
  const octet = (index: number) => parseInt(bits.slice(start + 8 * index, start + 8 * index + 8), 2)
  return [octet(0), octet(1), octet(2), octet(3)]
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
