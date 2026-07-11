import chromium from '@sparticuz/chromium'
import { chromium as playwright, type Browser } from 'playwright-core'

let browserPromise: Promise<Browser> | null = null

async function launch(): Promise<Browser> {
  // On Vercel, @sparticuz/chromium inflates a bundled binary; locally, point at a system Chrome
  // via CHROME_EXECUTABLE_PATH (the @sparticuz binary is Linux-only and won't run on macOS).
  const executablePath = process.env.CHROME_EXECUTABLE_PATH ?? (await chromium.executablePath())
  // @sparticuz's args target puppeteer; --single-process / --no-zygote / the puppeteer-style
  // --headless='shell' crash playwright's Chromium on launch ("Target ... has been closed"). Strip
  // them, add --disable-dev-shm-usage (needed once single-process is gone), and let playwright manage
  // headless itself.
  const args = chromium.args.filter(
    (arg) => arg !== '--single-process' && arg !== '--no-zygote' && !arg.startsWith('--headless')
  )
  return playwright.launch({
    args: [...args, '--disable-dev-shm-usage'],
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
  if (existing?.isConnected()) return existing
  browserPromise = launch()
  return browserPromise
}
