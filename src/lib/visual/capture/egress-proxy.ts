import type { ResolverOptions } from 'node:dns'
import { Resolver } from 'node:dns/promises'
import {
  createServer,
  request,
  STATUS_CODES,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from 'node:http'
import { connect, isIP, type AddressInfo, type Socket } from 'node:net'
import { pipeline, type Duplex, type Readable, type Writable } from 'node:stream'
import { arePublicAddresses } from '@/lib/sources/validate-url'

/**
 * How long any socket the proxy holds may sit idle before it closes, and how long one dial's
 * connection attempts may take together (`dial`).
 */
const SOCKET_IDLE_MS = 20_000

/**
 * The proxy's DNS client: c-ares, never `dns.lookup`, whose getaddrinfo holds a libuv thread with
 * no timeout; it reads no hosts file (node doc/api/dns.md, "Implementation considerations"). Each
 * query tries every nameserver twice, each try waiting about 2 s at most: `maxTimeout` caps both
 * c-ares's retry doubling and the per-server timeout it learns (c-ares 1.34.6 in node v24.13.0:
 * src/lib/ares_process.c, src/lib/ares_metrics.c). WHY as: @types/node 20's `ResolverOptions`
 * lacks `maxTimeout`, which node v24.13.0 reads (lib/internal/dns/utils.js:53-57).
 */
const resolver = new Resolver({ timeout: 2_000, tries: 2, maxTimeout: 2_000 } as ResolverOptions)

/** Headers that describe one hop, not the request or response, dropped when either is passed on. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** A target the public-address rule refused: answered 403, where any other failure is 502. */
class EgressRefused extends Error {}

let started: Promise<string> | null = null

/** A proxy request's target: host (IPv6 brackets stripped), port and origin-form path. */
type Target = { protocol: string; host: string; port: number; path: string }

/** Reads a target from a URL the proxy was asked for; null when it does not parse. */
function parseTarget(raw: string): Target | null {
  if (!URL.canParse(raw)) return null
  const url = new URL(raw)
  return {
    protocol: url.protocol,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    path: `${url.pathname}${url.search}`,
  }
}

/** The status a failed dial is answered with. */
function statusFor(err: unknown): number {
  return err instanceof EgressRefused ? 403 : 502
}

/**
 * Closes `stream` when it errors or its idle timer fires, so neither escapes a handler as an
 * exception (an 'error' with no listener throws).
 */
function closeOnFailure(stream: Duplex): void {
  stream.on('error', () => stream.destroy())
  stream.on('timeout', () => stream.destroy())
}

/**
 * Pipes `from` into `to`, destroying both when either fails. When either is already gone both are
 * destroyed instead, because piping into a closed or destroyed stream throws synchronously (node
 * lib/internal/streams/pipeline.js:263-265 at v24.13.0), which would escape the handler.
 */
function pipeSafely(from: Readable, to: Writable): void {
  if (from.destroyed || to.destroyed) {
    from.destroy()
    to.destroy()
    return
  }
  pipeline(from, to, () => undefined)
}

/**
 * A TCP connection to `address`, or null when it closes before connecting (refused, unreachable,
 * or not connected within `connectMs`). Once connected it closes after `SOCKET_IDLE_MS` idle.
 */
function openSocket(address: string, port: number, connectMs: number): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = connect({ host: address, port, timeout: connectMs })
    closeOnFailure(socket)
    socket.once('connect', () => resolve(socket.setTimeout(SOCKET_IDLE_MS)))
    socket.once('close', () => resolve(null))
  })
}

/**
 * Every address `host` has, IPv4 first, from one A and one AAAA query sent together. An IP
 * literal is its own answer, because c-ares queries DNS for one as if it were a name (observed
 * with node v24.13.0). A family whose query fails or finds no records adds nothing, so a name
 * with no answer comes back empty; with no hosts file read, 'localhost' has only what DNS says.
 */
async function resolveAddresses(host: string): Promise<string[]> {
  if (isIP(host)) return [host]
  const families = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)])
  return families.flatMap((family) => (family.status === 'fulfilled' ? family.value : []))
}

/**
 * Resolves `host` once and connects to the first of those same addresses that accepts, never
 * resolving again, so a name that re-resolves to a private address (DNS rebinding) gains nothing.
 * Refuses (`EgressRefused`, logged here only) any answer `arePublicAddresses` refuses
 * (src/lib/sources/validate-url.ts), and adds no port rule, which would refuse what `captureSite`
 * let through. Rejects when no address connects.
 */
async function dial(host: string, port: number): Promise<Socket> {
  const addresses = await resolveAddresses(host)
  if (!arePublicAddresses(addresses)) {
    const found = addresses.join(', ') || 'no address'
    console.warn(`[capture:egress] refused ${host}:${port} (${found})`)
    throw new EgressRefused(host)
  }
  const connectMs = SOCKET_IDLE_MS / addresses.length
  for (const address of addresses) {
    const socket = await openSocket(address, port, connectMs)
    if (socket) return socket
  }
  throw new Error(`could not reach ${host}:${port}`)
}

/** Copies `headers` without the hop-by-hop ones. */
function withoutHopByHop(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name)))
}

/** Answers an absolute-form request the proxy will not pass on, and closes the connection. */
function answer(res: ServerResponse, status: number): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(status, { connection: 'close' }).end()
}

/** Answers a CONNECT the proxy will not open, and closes the connection. */
function refuse(client: Duplex, status: number): void {
  client.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`)
}

/**
 * Passes one absolute-form http:// request on over a socket dialled for it alone, so a client that
 * reuses its proxy connection for another host is checked again. Nothing may escape as an
 * exception, and the listeners run outside the catch: they relay only 200–999 (`writeHead` throws
 * outside 100–999, node lib/_http_server.js; a 101 is a switch never asked for) and answer an
 * 'upgrade' 502, since node destroys an unheard one with no 'error' (lib/_http_client.js). llhttp
 * refuses, as an 'error', every header `writeHead` would throw on (observed with node v24.13.0).
 */
function forward(req: IncomingMessage, res: ServerResponse): void {
  const target = parseTarget(req.url ?? '')
  if (target?.protocol !== 'http:') {
    answer(res, 400)
    return
  }
  dial(target.host, target.port)
    .then((socket) => {
      const upstream = request({
        createConnection: () => socket,
        method: req.method,
        path: target.path,
        headers: withoutHopByHop(req.headers),
      })
      upstream.on('response', (reply) => {
        const status = reply.statusCode ?? 0
        if (status < 200 || status > 999) {
          answer(res, 502)
          reply.destroy()
          return
        }
        if (!res.destroyed) res.writeHead(status, withoutHopByHop(reply.headers))
        pipeSafely(reply, res)
      })
      upstream.on('upgrade', (_reply, upgraded) => {
        answer(res, 502)
        upgraded.destroy()
      })
      upstream.on('error', () => answer(res, 502))
      pipeSafely(req, upstream)
    })
    .catch((err: unknown) => answer(res, statusFor(err)))
}

/**
 * Opens a CONNECT tunnel to a dialled socket and pipes it both ways. It carries https and every
 * WebSocket, since Chromium tunnels ws:// too (net/socket/client_socket_pool.cc at 149.0.7827.22),
 * so the server has no 'upgrade' listener and node hands an absolute-form upgrade to `forward`. The
 * client socket arrives without the server's error and timeout listeners but with its idle timer
 * (`server.timeout`), so the tunnel adds its own (node lib/_http_server.js at v24.13.0).
 */
function tunnel(req: IncomingMessage, client: Duplex, head: Buffer): void {
  closeOnFailure(client)
  const target = parseTarget(`http://${req.url ?? ''}`)
  if (!target) {
    refuse(client, 400)
    return
  }
  dial(target.host, target.port)
    .then((upstream) => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      pipeSafely(client, upstream)
      pipeSafely(upstream, client)
    })
    .catch((err: unknown) => refuse(client, statusFor(err)))
}

/**
 * Starts the proxy on 127.0.0.1 at a port the OS picks, and resolves to its URL. A server error
 * is logged once here and, during the start, also rejects it; `egressProxyUrl` starts it again on
 * its next call. WHY as: a
 * TCP listen always reports an `AddressInfo` (a string is a pipe path, null only before
 * listening).
 */
function startProxy(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.timeout = SOCKET_IDLE_MS
    server.on('request', forward)
    server.on('connect', tunnel)
    server.on('error', (err) => {
      console.error('[capture:egress] proxy server failed', err)
      reject(err)
    })
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    })
  })
}

/**
 * The URL of the brand capture's egress proxy: the one place the public-address rule is enforced
 * for everything a captured site makes Chromium fetch. That holds only while every capture context
 * sends every request here (`captureOnce`, capture-site.ts), so Chromium resolves no host itself
 * (net/docs/proxy.md, "HTTP proxy scheme", at 149.0.7827.22). One proxy per process, started by
 * the first caller; a failed start is retried by the next.
 */
export function egressProxyUrl(): Promise<string> {
  started ??= startProxy().catch((err: unknown) => {
    started = null
    throw err
  })
  return started
}
