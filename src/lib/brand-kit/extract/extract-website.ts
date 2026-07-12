import { getBrowser } from '@/lib/render/browser'
import { DEFAULT_TOKENS, type BrandTokens } from '@/lib/scene-graph'
import { applyVisionAccent, deriveColorRoles } from './color-roles'
import { matchDisplayAndBody } from './font-match'
import { measurePage } from './measure'
import type { ExtractionReport, ExtractionResult } from './report'
import { fitTypeScale } from './type-scale'
import { visionRefine } from './vision'

const NAV_TIMEOUT_MS = 30_000
const VIEWPORT = { width: 1440, height: 2400 }
// Longest screenshot edge fed to Claude vision (its hard limit is 8000px; leave headroom).
const MAX_SCREENSHOT_EDGE = 7800

/**
 * The website extractor (§2.1): measure resolved styles in Chromium, cluster colours + fit a type
 * scale (deterministic, `measured`), then let vision re-pick the accent and infer mood/subjects/feed
 * system (`inferred`). Font families map to the nearest library family so the kit always renders. Never
 * throws to the caller's onboarding — failures are handled one level up as a soft fallback.
 */
export async function extractBrandKitFromWebsite(url: string): Promise<ExtractionResult> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 })
    // Tolerate a bare host — page.goto needs a scheme, same as the verbal fetcher.
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
    // Wait for `load`, not `networkidle0` — many sites never go network-idle (analytics, ads, sockets).
    // Don't fail on a slow load: swallow the timeout and measure whatever has rendered.
    await page.goto(target, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS }).catch(() => undefined)
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined)

    const measurement = await measurePage(page)

    // Screenshot the WHOLE page, not just the hero — the banner is often a stock photo, and the real
    // brand design (buttons, section colours, type) lives below the fold. Downscale via deviceScaleFactor
    // so even a long page stays under Claude's 8000px image limit; the viewport stays normal so a 100vh
    // hero doesn't balloon.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    const shotScale = Math.min(1, MAX_SCREENSHOT_EDGE / Math.max(scrollHeight, VIEWPORT.height))
    if (shotScale < 1) await page.setViewport({ ...VIEWPORT, deviceScaleFactor: shotScale })
    const screenshot = Buffer.from(await page.screenshot({ type: 'png', fullPage: true }))

    const roles = deriveColorRoles(measurement.colors)
    const { scale, baseSize } = fitTypeScale(measurement.fontSizes)

    const accentCandidates = [roles.accent, ...(measurement.colors.accents ?? []).map((a) => a.hex)]
    const vision = await visionRefine({
      base64: screenshot.toString('base64'),
      mediaType: 'image/png',
      source: 'website',
      accentCandidates,
    })

    const color = applyVisionAccent(roles, vision.accent)
    const fonts = matchDisplayAndBody(measurement.headingStack, measurement.bodyStack, {
      display: DEFAULT_TOKENS.type.display.family,
      body: DEFAULT_TOKENS.type.body.family,
    })
    const tokens: BrandTokens = {
      color,
      type: {
        display: { ...DEFAULT_TOKENS.type.display, family: fonts.display.family },
        body: { ...DEFAULT_TOKENS.type.body, family: fonts.body.family },
        scale,
        baseSize: Math.round(baseSize),
      },
      space: DEFAULT_TOKENS.space,
      grid: DEFAULT_TOKENS.grid,
    }

    const report: ExtractionReport = {
      source: 'website',
      confidence: {
        colors: 'measured',
        accent: vision.accent ? 'inferred' : 'measured',
        // `measured` only when the site's own faces are in the library; a category fallback is a guess.
        fonts: fonts.display.exact && fonts.body.exact ? 'measured' : 'guessed',
        typeScale: 'measured',
        mood: 'inferred',
        subjects: 'inferred',
      },
      feedSystemRecommendation: vision.feedSystem,
      brief: { photographicSubjects: vision.photographicSubjects, motifs: vision.motifs, mood: vision.mood },
    }

    return { tokens, report, subjects: { photographic: vision.photographicSubjects, motifs: vision.motifs } }
  } finally {
    await page.close()
  }
}
