import { createServer, type Server } from 'node:http'
import {
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
} from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The resolver answers what each test says and counts its queries; `connect` records where the
 * proxy dials and within what bound, and delivers each dial to a local server (`ports`, else the
 * HTTP upstream), so a public-looking address never leaves the machine.
 */
const mocks = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolverOptions: [] as unknown[],
  dialled: [] as Array<{ host: string; port: number }>,
  connectBounds: [] as number[],
  ports: new Map<string, number>(),
  upstreamPort: 0,
}))
vi.mock('node:dns/promises', () => ({
  Resolver: class {
    constructor(options: unknown) {
      mocks.resolverOptions.push(options)
    }
    resolve4(host: string) {
      return mocks.resolve4(host)
    }
    resolve6(host: string) {
      return mocks.resolve6(host)
    }
  },
}))
vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>()
  return {
    ...actual,
    connect: (options: { host: string; port: number; timeout?: number }) => {
      mocks.dialled.push({ host: options.host, port: options.port })
      mocks.connectBounds.push(options.timeout ?? 0)
      return actual.connect({
        host: '127.0.0.1',
        port: mocks.ports.get(options.host) ?? mocks.upstreamPort,
        timeout: options.timeout,
      })
    },
  }
})

import { egressProxyUrl } from '../egress-proxy'

const PUBLIC = '93.184.216.34'
const PUBLIC_6 = '2606:2800:220:1:248:1893:25c8:1946'

let upstream: Server
let rawUpstream: TcpServer
let rawReply = ''
let rawPort = 0
let closedPort = 0
let proxyPort = 0
let warn: ReturnType<typeof vi.spyOn>

/** One family's answer as c-ares gives it: its addresses, or ENODATA when it has none. */
function records(...addresses: string[]): () => Promise<string[]> {
  return () =>
    addresses.length > 0
      ? Promise.resolve(addresses)
      : Promise.reject(Object.assign(new Error('query ENODATA site.test'), { code: 'ENODATA' }))
}

/** Answers `v4` for A and `v6` for AAAA on every query. */
function resolveTo(v4: readonly string[], v6: readonly string[]): void {
  mocks.resolve4.mockImplementation(records(...v4))
  mocks.resolve6.mockImplementation(records(...v6))
}

/** Listens on a free local port and resolves with it. WHY as: a TCP listen reports an AddressInfo. */
async function listen(server: Server | TcpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

/**
 * Sends raw bytes to the proxy over a real socket and resolves with everything it answers until
 * the connection closes.
 */
async function send(raw: string): Promise<string> {
  const { connect } = await vi.importActual<typeof import('node:net')>('node:net')
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: proxyPort }, () => socket.write(raw))
    let received = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => (received += chunk))
    socket.on('end', () => resolve(received))
    socket.on('error', reject)
  })
}

/** A plain GET for `path`, closing its connection, as a client writes it through a tunnel. */
function plainGet(path: string): string {
  return `GET ${path} HTTP/1.1\r\nHost: site.test\r\nConnection: close\r\n\r\n`
}

/** An absolute-form GET for site.test, closing its connection, as a client sends plain http. */
const ABSOLUTE_GET =
  'GET http://site.test/page HTTP/1.1\r\nHost: site.test\r\nConnection: close\r\n\r\n'

/** A CONNECT to site.test:443 carrying one plain GET for `/`. */
const CONNECT_GET = `CONNECT site.test:443 HTTP/1.1\r\nHost: site.test:443\r\n\r\n${plainGet('/')}`

beforeAll(async () => {
  upstream = createServer((req, res) => {
    res.writeHead(200, { connection: 'close' })
    res.end(
      `upstream saw ${req.method} ${req.url} host=${req.headers.host} proxy-connection=${req.headers['proxy-connection'] ?? 'none'}`
    )
  })
  mocks.upstreamPort = await listen(upstream)
  rawUpstream = createTcpServer((socket) => {
    socket.on('error', () => socket.destroy())
    socket.once('data', () => socket.end(rawReply))
  })
  rawPort = await listen(rawUpstream)
  const closed = createTcpServer()
  closedPort = await listen(closed)
  await new Promise((resolve) => closed.close(resolve))
  proxyPort = Number(new URL(await egressProxyUrl()).port)
})

afterAll(async () => {
  await new Promise((resolve) => upstream.close(resolve))
  await new Promise((resolve) => rawUpstream.close(resolve))
})

beforeEach(() => {
  mocks.dialled.length = 0
  mocks.connectBounds.length = 0
  mocks.ports.clear()
  mocks.resolve4.mockReset()
  mocks.resolve6.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warn.mockRestore()
})

describe('egressProxyUrl — a capture reaches only public addresses', () => {
  const REFUSED_ANSWERS = [
    ['127.0.0.1', ['127.0.0.1'], []],
    ['10.x', ['10.1.2.3'], []],
    ['::1', [], ['::1']],
    ['an IPv4-mapped loopback', [], ['::ffff:127.0.0.1']],
    ['one private address among public ones', [PUBLIC, '192.168.1.1'], []],
    ['a public IPv4 beside a private IPv6', [PUBLIC], ['fd00::1']],
    ['a private IPv4 beside a public IPv6', ['192.168.1.1'], [PUBLIC_6]],
    ['no address in either family', [], []],
  ] as const

  it.each(REFUSED_ANSWERS)(
    'refuses a CONNECT to a host resolving to %s, dials nothing, and logs it once',
    async (_label, v4, v6) => {
      resolveTo(v4, v6)
      const reply = await send('CONNECT site.test:443 HTTP/1.1\r\nHost: site.test:443\r\n\r\n')
      expect(reply).toMatch(/^HTTP\/1\.1 403 /)
      expect(mocks.dialled).toEqual([])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('[capture:egress] refused site.test:443')
    }
  )

  it.each(REFUSED_ANSWERS)(
    'refuses an absolute-form GET to a host resolving to %s, and dials nothing',
    async (_label, v4, v6) => {
      resolveTo(v4, v6)
      const reply = await send(ABSOLUTE_GET)
      expect(reply).toMatch(/^HTTP\/1\.1 403 /)
      expect(mocks.dialled).toEqual([])
    }
  )

  it('refuses a name DNS does not know', async () => {
    const notFound = Object.assign(new Error('queryA ENOTFOUND gone.test'), { code: 'ENOTFOUND' })
    mocks.resolve4.mockRejectedValue(notFound)
    mocks.resolve6.mockRejectedValue(notFound)
    const reply = await send('CONNECT gone.test:443 HTTP/1.1\r\nHost: gone.test:443\r\n\r\n')
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(mocks.dialled).toEqual([])
  })

  it('refuses an empty answer', async () => {
    mocks.resolve4.mockResolvedValue([])
    mocks.resolve6.mockResolvedValue([])
    const reply = await send(ABSOLUTE_GET)
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(mocks.dialled).toEqual([])
  })

  it.each([
    ['127.0.0.1', '127.0.0.1:443'],
    ['::1', '[::1]:443'],
  ])('refuses the literal address %s without resolving it', async (_label, authority) => {
    const reply = await send(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`)
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(mocks.dialled).toEqual([])
    expect(mocks.resolve4).not.toHaveBeenCalled()
    expect(mocks.resolve6).not.toHaveBeenCalled()
  })

  it('answers 502 when no checked address connects', async () => {
    resolveTo([PUBLIC], [PUBLIC_6])
    mocks.ports.set(PUBLIC, closedPort).set(PUBLIC_6, closedPort)
    const reply = await send(CONNECT_GET)
    expect(reply).toMatch(/^HTTP\/1\.1 502 /)
    expect(mocks.dialled).toEqual([
      { host: PUBLIC, port: 443 },
      { host: PUBLIC_6, port: 443 },
    ])
  })

  it('resolves through a resolver that gives up on its own', () => {
    expect(mocks.resolverOptions).toEqual([
      expect.objectContaining({ timeout: expect.any(Number), tries: expect.any(Number) }),
    ])
  })
})

describe('egressProxyUrl — it connects to the address it checked, though a second lookup would answer a private one', () => {
  beforeEach(() => {
    mocks.resolve4.mockImplementationOnce(records(PUBLIC)).mockImplementation(records('10.0.0.1'))
    mocks.resolve6.mockImplementationOnce(records()).mockImplementation(records('::1'))
  })

  it('tunnels a CONNECT to the checked address, resolving each family once', async () => {
    const reply = await send(
      `CONNECT site.test:443 HTTP/1.1\r\nHost: site.test:443\r\n\r\n${plainGet('/page')}`
    )
    expect(reply).toMatch(/^HTTP\/1\.1 200 Connection Established\r\n\r\n/)
    expect(reply).toContain('upstream saw GET /page host=site.test')
    expect(mocks.dialled).toEqual([{ host: PUBLIC, port: 443 }])
    expect(mocks.resolve4).toHaveBeenCalledTimes(1)
    expect(mocks.resolve4).toHaveBeenCalledWith('site.test')
    expect(mocks.resolve6).toHaveBeenCalledTimes(1)
    expect(mocks.resolve6).toHaveBeenCalledWith('site.test')
  })

  it('passes an absolute-form GET on in origin form, without hop-by-hop headers', async () => {
    const reply = await send(
      'GET http://site.test/page?q=1 HTTP/1.1\r\nHost: site.test\r\nProxy-Connection: keep-alive\r\nConnection: close\r\n\r\n'
    )
    expect(reply).toMatch(/^HTTP\/1\.1 200 /)
    expect(reply).toContain('upstream saw GET /page?q=1 host=site.test proxy-connection=none')
    expect(mocks.dialled).toEqual([{ host: PUBLIC, port: 80 }])
    expect(mocks.resolve4).toHaveBeenCalledTimes(1)
    expect(mocks.resolve6).toHaveBeenCalledTimes(1)
  })

  it('lets a public address through on any port — the rule in src/lib/sources/validate-url.ts judges addresses only', async () => {
    const reply = await send(
      `CONNECT site.test:8443 HTTP/1.1\r\nHost: site.test:8443\r\n\r\n${plainGet('/')}`
    )
    expect(reply).toContain('upstream saw GET / host=site.test')
    expect(mocks.dialled).toEqual([{ host: PUBLIC, port: 8443 }])
  })
})

describe('egressProxyUrl — it tries the checked addresses in order', () => {
  it('falls back from an IPv4 address that refuses the connection to the IPv6 one', async () => {
    resolveTo([PUBLIC], [PUBLIC_6])
    mocks.ports.set(PUBLIC, closedPort)
    const reply = await send(CONNECT_GET)
    expect(reply).toContain('upstream saw GET / host=site.test')
    expect(mocks.dialled).toEqual([
      { host: PUBLIC, port: 443 },
      { host: PUBLIC_6, port: 443 },
    ])
    expect(mocks.resolve4).toHaveBeenCalledTimes(1)
    expect(mocks.resolve6).toHaveBeenCalledTimes(1)
  })

  it('bounds the attempts together by one idle period of 20 s', async () => {
    resolveTo([PUBLIC, '93.184.216.35', '93.184.216.36'], [PUBLIC_6])
    mocks.ports.set(PUBLIC, closedPort).set('93.184.216.35', closedPort)
    const reply = await send(CONNECT_GET)
    expect(reply).toContain('upstream saw GET / host=site.test')
    expect(mocks.dialled.map((dial) => dial.host)).toEqual([
      PUBLIC,
      '93.184.216.35',
      '93.184.216.36',
    ])
    expect(mocks.connectBounds).toEqual([5_000, 5_000, 5_000])
  })

  it('dials a literal public address without resolving it', async () => {
    const reply = await send(
      `CONNECT ${PUBLIC}:443 HTTP/1.1\r\nHost: ${PUBLIC}:443\r\n\r\n${plainGet('/')}`
    )
    expect(reply).toContain('upstream saw GET / host=site.test')
    expect(mocks.dialled).toEqual([{ host: PUBLIC, port: 443 }])
    expect(mocks.resolve4).not.toHaveBeenCalled()
  })
})

describe('egressProxyUrl — an upstream answer it cannot pass on is a 502', () => {
  let thrown: unknown[] = []
  const record = (err: unknown) => thrown.push(err)

  beforeEach(() => {
    thrown = []
    process.on('uncaughtException', record)
    resolveTo([PUBLIC], [])
    mocks.ports.set(PUBLIC, rawPort)
  })

  afterEach(() => {
    process.off('uncaughtException', record)
  })

  it.each([
    ['status 099', 'HTTP/1.1 099 Odd\r\nContent-Length: 0\r\n\r\n'],
    ['status 000', 'HTTP/1.1 000 Odd\r\nContent-Length: 0\r\n\r\n'],
    [
      'a 101 switching to WebSocket',
      'HTTP/1.1 101 Switching\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    ],
    ['a 101 naming no protocol', 'HTTP/1.1 101 Switching\r\n\r\n'],
  ])('answers 502 to %s, and nothing throws', async (_label, raw) => {
    rawReply = raw
    const reply = await send(ABSOLUTE_GET)
    expect(reply).toMatch(/^HTTP\/1\.1 502 /)
    expect(thrown).toEqual([])
  })
})
