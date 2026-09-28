import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

let browserPromise: Promise<Browser> | null = null

/**
 * WebRTC may send no UDP that a proxy does not carry, so a captured page cannot route around the
 * capture's egress proxy (src/lib/visual/capture/egress-proxy.ts). It changes nothing for
 * `renderPdf` (pdf.ts), which opens no connection of its own.
 */
const CAPTURE_ARGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

/**
 * Starts Chromium for this runtime. Local dev names a system Chrome in CHROME_EXECUTABLE_PATH,
 * since the @sparticuz binary is Linux-only, and gets a minimal argument set: the serverless
 * arguments (--single-process, --no-zygote) can hang desktop Chrome, so @sparticuz's tuned set is
 * for the Vercel/Linux runtime alone. Both get `CAPTURE_ARGS`.
 */
async function launch(): Promise<Browser> {
  const localChrome = process.env.CHROME_EXECUTABLE_PATH
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', ...CAPTURE_ARGS],
    })
  }
  return puppeteer.launch({
    args: [...chromium.args, ...CAPTURE_ARGS],
    executablePath: await chromium.executablePath(),
    headless: true,
  })
}

/**
 * A warm, module-scoped Chromium reused across warm invocations (Vercel Fluid Compute). Relaunches
 * only if the previous browser died or crashed — never cold-launches per request when one is alive.
 */
export async function getBrowser(): Promise<Browser> {
  const existing = browserPromise ? await browserPromise.catch(() => null) : null
  if (existing?.connected) return existing
  browserPromise = launch()
  return browserPromise
}
