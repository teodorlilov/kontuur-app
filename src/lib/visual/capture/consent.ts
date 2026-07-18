import type { Page } from 'puppeteer-core'

/**
 * Best-effort dismissal of cookie/consent overlays so we measure the brand, not the modal. Clicks a
 * known CMP accept control or a short "Accept/Allow/Agree" button, then strips any leftover fixed
 * full-screen overlay still covering the viewport. All in-page and swallowed — never blocks capture.
 */
export async function dismissConsent(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const SELECTORS = [
        '#onetrust-accept-btn-handler', '#truste-consent-button', '.cc-allow',
        '.js-accept-cookies', '[data-testid*="accept" i]', 'button[aria-label*="accept" i]',
      ]
      const TEXT = /^(accept|allow|agree|got it|i agree|accept all|allow all|ok)\b/i
      const click = (el: Element | null): boolean => {
        if (el instanceof HTMLElement) { el.click(); return true }
        return false
      }
      for (const s of SELECTORS) if (click(document.querySelector(s))) return
      for (const b of Array.from(document.querySelectorAll('button, a, [role="button"]'))) {
        const t = (b.textContent ?? '').trim()
        if (t.length < 30 && TEXT.test(t) && click(b)) return
      }
    })
    .catch(() => undefined)

  await page
    .evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const s = getComputedStyle(el)
        const rect = (el as HTMLElement).getBoundingClientRect()
        const coversViewport = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9
        const isOverlay = (s.position === 'fixed' || s.position === 'sticky') && Number(s.zIndex) >= 1000
        if (coversViewport && isOverlay) (el as HTMLElement).style.display = 'none'
      }
    })
    .catch(() => undefined)
}
