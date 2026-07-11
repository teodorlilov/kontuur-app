import type { Page } from 'playwright-core'
import { parseCssColor, toHex } from './color'
import type { ColorObservations, ColorSample } from './color-roles'

export type PageMeasurement = {
  colors: ColorObservations
  fontSizes: number[]
  headingStack: string
  bodyStack: string
}

type RawMeasurement = {
  backgrounds: { color: string; area: number }[]
  texts: { color: string; size: number }[]
  borders: string[]
  accents: string[]
  headingStack: string
  bodyStack: string
}

/** Merge samples of the same colour, summing their weights, so the dominant colour wins the role. */
function aggregate(samples: ColorSample[]): ColorSample[] {
  const byHex = new Map<string, number>()
  for (const s of samples) byHex.set(s.hex, (byHex.get(s.hex) ?? 0) + s.weight)
  return [...byHex.entries()].map(([hex, weight]) => ({ hex, weight }))
}

function toSamples(entries: { color: string; weight: number }[]): ColorSample[] {
  const out: ColorSample[] = []
  for (const e of entries) {
    const rgb = parseCssColor(e.color)
    if (rgb) out.push({ hex: toHex(rgb), weight: e.weight })
  }
  return aggregate(out)
}

/**
 * Measure a loaded page's resolved styles: background/text/border/accent colours (categorised, so
 * `deriveColorRoles` can cluster them) and the heading/body font stacks + the observed size ladder for
 * `fitTypeScale`. Everything here is `measured`; vision refines it afterwards. Runs in Chromium.
 */
export async function measurePage(page: Page): Promise<PageMeasurement> {
  const raw: RawMeasurement = await page.evaluate(() => {
    const backgrounds: { color: string; area: number }[] = []
    const texts: { color: string; size: number }[] = []
    const borders: string[] = []
    const accents: string[] = []
    const isOpaque = (c: string) => c !== 'transparent' && !/,\s*0\)\s*$/.test(c)

    for (const el of Array.from(document.querySelectorAll('body, header, main, section, div, footer, nav'))) {
      const s = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const area = rect.width * rect.height
      if (area > 10000 && isOpaque(s.backgroundColor)) backgrounds.push({ color: s.backgroundColor, area })
      if (s.borderTopWidth !== '0px' && isOpaque(s.borderTopColor)) borders.push(s.borderTopColor)
    }
    for (const el of Array.from(document.querySelectorAll('h1, h2, h3, p, li, a, body'))) {
      const s = getComputedStyle(el)
      const size = parseFloat(s.fontSize)
      if (isOpaque(s.color) && size > 0) texts.push({ color: s.color, size })
    }
    for (const el of Array.from(document.querySelectorAll('a'))) {
      const s = getComputedStyle(el)
      if (isOpaque(s.color)) accents.push(s.color)
    }
    for (const el of Array.from(document.querySelectorAll('button, .btn, [role="button"]'))) {
      const s = getComputedStyle(el)
      if (isOpaque(s.backgroundColor)) accents.push(s.backgroundColor)
    }
    const heading = document.querySelector('h1') ?? document.querySelector('h2')
    return {
      backgrounds,
      texts,
      borders,
      accents,
      headingStack: (heading ? getComputedStyle(heading) : getComputedStyle(document.body)).fontFamily,
      bodyStack: getComputedStyle(document.body).fontFamily,
    }
  })

  return {
    colors: {
      backgrounds: toSamples(raw.backgrounds.map((b) => ({ color: b.color, weight: b.area }))),
      texts: toSamples(raw.texts.map((t) => ({ color: t.color, weight: 1 }))),
      borders: toSamples(raw.borders.map((c) => ({ color: c, weight: 1 }))),
      accents: toSamples(raw.accents.map((c) => ({ color: c, weight: 1 }))),
    },
    fontSizes: raw.texts.map((t) => t.size),
    headingStack: raw.headingStack,
    bodyStack: raw.bodyStack,
  }
}
