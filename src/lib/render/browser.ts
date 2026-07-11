import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

let browserPromise: Promise<Browser> | null = null

async function launch(): Promise<Browser> {
  // On Vercel, @sparticuz/chromium inflates a bundled binary; locally, point at a system Chrome via
  // CHROME_EXECUTABLE_PATH (the @sparticuz binary is Linux-only and won't run on macOS). @sparticuz's
  // args are built for puppeteer, so they pass through unfiltered here (unlike playwright).
  const executablePath = process.env.CHROME_EXECUTABLE_PATH ?? (await chromium.executablePath())
  return puppeteer.launch({
    args: chromium.args,
    executablePath,
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
