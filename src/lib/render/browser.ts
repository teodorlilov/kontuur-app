import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

let browserPromise: Promise<Browser> | null = null

async function launch(): Promise<Browser> {
  // Local dev points at a system Chrome via CHROME_EXECUTABLE_PATH (the @sparticuz binary is Linux-only).
  // Its serverless args (--single-process, --no-zygote) can hang desktop Chrome, so use a minimal set
  // locally and reserve @sparticuz's tuned args for the Vercel/Linux runtime.
  const localChrome = process.env.CHROME_EXECUTABLE_PATH
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return puppeteer.launch({
    args: chromium.args,
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
