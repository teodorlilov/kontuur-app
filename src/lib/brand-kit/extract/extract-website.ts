import { getBrowser } from '@/lib/render/browser'
import { proposeFamilies } from '@/lib/render/font-filter'
import { DEFAULT_TOKENS, type BrandTokens } from '@/lib/scene-graph'
import { applyVisionAccent, deriveColorRoles } from './color-roles'
import { familyCategory } from './font-detect'
import { measurePage } from './measure'
import type { ExtractionReport, ExtractionResult } from './report'
import { fitTypeScale } from './type-scale'
import { visionRefine } from './vision'

const NAV_TIMEOUT_MS = 20_000
const VIEWPORT = { width: 1440, height: 2400 }

function familyFor(category: ReturnType<typeof familyCategory>, fallback: string): string {
  return proposeFamilies(category)[0]?.family ?? fallback
}

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
    await page.goto(target, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS })
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined)

    const measurement = await measurePage(page)
    const bodyHandle = await page.$('body')
    const shot = bodyHandle ? await bodyHandle.screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' })
    const screenshot = Buffer.from(shot)

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
    const tokens: BrandTokens = {
      color,
      type: {
        display: { ...DEFAULT_TOKENS.type.display, family: familyFor(familyCategory(measurement.headingStack), DEFAULT_TOKENS.type.display.family) },
        body: { ...DEFAULT_TOKENS.type.body, family: familyFor(familyCategory(measurement.bodyStack), DEFAULT_TOKENS.type.body.family) },
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
        fonts: 'measured',
        typeScale: 'measured',
        mood: 'inferred',
        subjects: 'inferred',
      },
      feedSystemRecommendation: vision.feedSystem,
    }

    return { tokens, report, subjects: { photographic: vision.photographicSubjects, motifs: vision.motifs } }
  } finally {
    await page.close()
  }
}
