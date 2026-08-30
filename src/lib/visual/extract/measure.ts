import type { Page } from 'puppeteer-core'
import { parseCssColor, toHex } from './color'
import { AREA_PER_VOTE, type ColorObservations, type ColorSample } from './color-roles'

export type PageMeasurement = {
  colors: ColorObservations
  fontSizes: number[]
}

type RawMeasurement = {
  backgrounds: { color: string; area: number }[]
  texts: { color: string; size: number }[]
  borders: string[]
  /** Weighted by rendered area: a hero call-to-action states a brand colour, a footer link mentions it. */
  accents: { color: string; weight: number }[]
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
 * Measure a loaded page's resolved styles: background/text/border/accent colours, categorised so
 * `deriveColorRoles` can cluster them into a palette. Font sizes are collected but not
 * categorised — their only reader is `hasEnoughSignal`, which treats a page resolving fewer than
 * two of them as a blank shell rather than a site worth extracting. Runs in Chromium.
 *
 * This used to close by saying the results were badged `measured` and that "vision refines it
 * afterwards". There is no vision pass and there never was; the confidence map it implied has since
 * been deleted. What corrects a bad reading is the user, in the palette editor.
 */
export async function measurePage(page: Page): Promise<PageMeasurement> {
  // `AREA_PER_VOTE` is passed IN rather than closed over: this callback is serialised and run in the
  // page's own context, where nothing this module imports exists. `deriveColorRoles` divides its
  // background candidates by the same number, and the two accent pools are only on one scale while
  // they agree — so it travels rather than being written out twice.
  const raw: RawMeasurement = await page.evaluate((AREA_PER_VOTE: number) => {
    const backgrounds: { color: string; area: number }[] = []
    const texts: { color: string; size: number }[] = []
    const borders: string[] = []
    const accents: { color: string; weight: number }[] = []
    const isOpaque = (c: string) => c !== 'transparent' && !/,\s*0\)\s*$/.test(c)
    // Floor at 1 so a zero-height inline element still registers rather than scoring as absent.
    const areaOf = (el: Element) => {
      const r = el.getBoundingClientRect()
      return Math.max(r.width * r.height, 1)
    }

    /**
     * Whether a human can actually see this element.
     *
     * Accessibility furniture is the reason. A skip-navigation link is a real `<a>` with a real
     * computed colour and a real box — parked off-screen or clipped to nothing — and one live site
     * had 28 of them totalling more measured area than every visible button on the page combined.
     * Its theme-default pink was picked as the brand's primary colour, on a site that is entirely
     * blue. Screen-reader-only text, closed dropdowns and collapsed menus all fail the same way.
     *
     * `checkVisibility` covers display, visibility, content-visibility and opacity; the bounds test
     * covers the off-screen parking that the skip-link pattern actually uses.
     */
    const isVisible = (el: Element) => {
      const withCheck = el as Element & {
        checkVisibility?: (o: { checkOpacity: boolean; checkVisibilityCSS: boolean }) => boolean
      }
      if (withCheck.checkVisibility) {
        if (!withCheck.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
          return false
      }
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth
    }

    for (const el of Array.from(
      document.querySelectorAll('body, header, main, section, div, footer, nav')
    )) {
      const s = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const area = rect.width * rect.height
      if (area > 10000 && isVisible(el) && isOpaque(s.backgroundColor))
        backgrounds.push({ color: s.backgroundColor, area })
      if (s.borderTopWidth !== '0px' && isOpaque(s.borderTopColor)) borders.push(s.borderTopColor)
    }
    for (const el of Array.from(document.querySelectorAll('h1, h2, h3, p, li, a, body'))) {
      const s = getComputedStyle(el)
      const size = parseFloat(s.fontSize)
      if (isVisible(el) && isOpaque(s.color) && size > 0) texts.push({ color: s.color, size })
    }
    // A link's colour paints GLYPHS, not its box — so it is counted per element, never by area.
    // Area-weighting them looked right and was badly wrong: a site's procedure cards are each
    // wrapped in an `<a>` with no text of its own, so the theme's default link colour scored the
    // largest area on the page while rendering literally nowhere. It was picked as the brand's
    // primary on a site that is entirely blue.
    for (const el of Array.from(document.querySelectorAll('a'))) {
      const s = getComputedStyle(el)
      if (!isVisible(el) || !isOpaque(s.color)) continue
      // No text of its own means the colour never paints, whatever the box measures.
      if ((el.textContent ?? '').trim().length === 0) continue
      accents.push({ color: s.color, weight: 1 })
    }
    // A BACKGROUND genuinely fills its box, so here area is the honest weight: one hero call-to-action
    // states a brand colour more loudly than a dozen small buttons. Scaled down to sit in the same
    // range as the per-element link counts above, so neither pool swamps the other.
    for (const el of Array.from(document.querySelectorAll('button, .btn, [role="button"]'))) {
      const s = getComputedStyle(el)
      if (isVisible(el) && isOpaque(s.backgroundColor))
        accents.push({ color: s.backgroundColor, weight: areaOf(el) / AREA_PER_VOTE })
    }
    // The logo, which is usually the truest statement a site makes about its colour and which an
    // `a`/`button` sweep never touches: brand marks are inline SVG, and their colour lives on the
    // shape's `fill`, not on any background. Scoped to the header/nav/logo region so a decorative
    // icon in the body cannot outvote the mark itself.
    for (const el of Array.from(
      document.querySelectorAll(
        'header svg *, nav svg *, [class*="logo" i] svg *, [id*="logo" i] svg *'
      )
    )) {
      // Visibility is asked of the OWNING <svg>, not the shape: `checkVisibility` and
      // `getBoundingClientRect` are unreliable on individual path/rect nodes, and asking them
      // directly filtered out a real logo and left that client with a greyscale palette.
      const owner = el.closest('svg') ?? el
      const fill = getComputedStyle(el).fill
      if (isVisible(owner) && fill && fill !== 'none' && isOpaque(fill)) {
        accents.push({ color: fill, weight: areaOf(owner) / AREA_PER_VOTE })
      }
    }
    return { backgrounds, texts, borders, accents }
  }, AREA_PER_VOTE)

  return {
    colors: {
      backgrounds: toSamples(raw.backgrounds.map((b) => ({ color: b.color, weight: b.area }))),
      texts: toSamples(raw.texts.map((t) => ({ color: t.color, weight: 1 }))),
      borders: toSamples(raw.borders.map((c) => ({ color: c, weight: 1 }))),
      accents: toSamples(raw.accents),
    },
    fontSizes: raw.texts.map((t) => t.size),
  }
}
