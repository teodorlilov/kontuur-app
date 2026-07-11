import type { Page } from 'puppeteer-core'
import { getBrowser } from '@/lib/render/browser'
import { proposeFamilies } from '@/lib/render/font-filter'
import { DEFAULT_TOKENS, type BrandTokens } from '@/lib/scene-graph'
import { applyVisionAccent } from './color-roles'
import { paletteToRoles } from './image-palette'
import { kmeans, type WeightedColor } from './kmeans'
import type { ExtractionReport, ExtractionResult } from './report'
import { visionRefine } from './vision'

const SAMPLE_SIZE = 64
const PALETTE_K = 6

/** Decode the image in a headless canvas and return quantised colour buckets for k-means. Reuses the
 *  Phase-0 browser rather than adding a native image decoder; swap for `sharp` if the browser is ever
 *  removed from this path. */
async function samplePalette(page: Page, dataUrl: string): Promise<WeightedColor[]> {
  return page.evaluate(
    async ({ url, size }): Promise<WeightedColor[]> => {
      const img = new Image()
      img.src = url
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return []
      ctx.drawImage(img, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)
      const buckets = new Map<string, { r: number; g: number; b: number; w: number }>()
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i + 3] ?? 0) < 128) continue
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0
        const key = `${r & 0xf0},${g & 0xf0},${b & 0xf0}`
        const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 }
        e.r += r
        e.g += g
        e.b += b
        e.w += 1
        buckets.set(key, e)
      }
      return [...buckets.values()].map((e) => ({ rgb: { r: e.r / e.w, g: e.g / e.w, b: e.b / e.w }, weight: e.w }))
    },
    { url: dataUrl, size: SAMPLE_SIZE }
  )
}

/**
 * The reference-image extractor (§2.2): k-means over decoded pixels → palette → the five roles by
 * luminance/saturation (colours `measured`), plus a vision pass for mood, subjects, and a font
 * category → library proposals (fonts `guessed` — never `measured`).
 */
export async function extractBrandKitFromImage(base64: string, mediaType: 'image/png' | 'image/jpeg'): Promise<ExtractionResult> {
  const browser = await getBrowser()
  const context = await browser.createBrowserContext()
  try {
    const page = await context.newPage()
    const palette = await samplePalette(page, `data:${mediaType};base64,${base64}`)
    const roles = paletteToRoles(kmeans(palette, PALETTE_K))

    const vision = await visionRefine({ base64, mediaType, source: 'image', accentCandidates: [] })
    const color = applyVisionAccent(roles, vision.accent)
    const displayFamily = proposeFamilies(vision.fontCategory)[0]?.family ?? DEFAULT_TOKENS.type.display.family

    const tokens: BrandTokens = {
      color,
      type: {
        display: { ...DEFAULT_TOKENS.type.display, family: displayFamily },
        body: DEFAULT_TOKENS.type.body,
        scale: DEFAULT_TOKENS.type.scale,
        baseSize: DEFAULT_TOKENS.type.baseSize,
      },
      space: DEFAULT_TOKENS.space,
      grid: DEFAULT_TOKENS.grid,
    }

    const report: ExtractionReport = {
      source: 'image',
      confidence: {
        colors: 'measured',
        accent: vision.accent ? 'inferred' : 'measured',
        fonts: 'guessed',
        mood: 'inferred',
        subjects: 'inferred',
      },
      feedSystemRecommendation: vision.feedSystem,
    }

    return { tokens, report, subjects: { photographic: vision.photographicSubjects, motifs: vision.motifs } }
  } finally {
    await context.close()
  }
}
