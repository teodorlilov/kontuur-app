import { describe, expect, it } from 'vitest'
import { removeSvgBackgroundRect, svgNaturalSize, svgRejectionReason } from '../sanitize-svg'

const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path d="M0 0h10" fill="#123456"/><use href="#a"/></svg>'

describe('svgRejectionReason', () => {
  it('accepts a plain vector with local fragment references', () => {
    expect(svgRejectionReason(SAFE_SVG)).toBeNull()
  })

  it('rejects non-SVG content', () => {
    expect(svgRejectionReason('<html><body>hi</body></html>')).toBe('is not an SVG document')
  })

  it.each([
    ['<svg><script>alert(1)</script></svg>', 'script'],
    ['<svg onload="alert(1)"><path d="M0 0"/></svg>', 'event handler'],
    ['<svg><a href="javascript:alert(1)">x</a></svg>', 'javascript:'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'foreignObject'],
    ['<svg><iframe src="#"/></svg>', 'embedded document'],
    ['<svg><image href="https://evil.test/a.png"/></svg>', 'external resource'],
    ['<svg><image xlink:href="https://evil.test/a.png"/></svg>', 'external resource'],
  ])('rejects active content: %s', (svg) => {
    expect(svgRejectionReason(svg)).not.toBeNull()
  })
})

describe('removeSvgBackgroundRect', () => {
  it('strips a full-canvas background rect', () => {
    const svg = '<svg viewBox="0 0 512 512"><rect width="512" height="512" fill="#123"/><path d="M0 0h10"/></svg>'
    expect(removeSvgBackgroundRect(svg)).toBe('<svg viewBox="0 0 512 512"><path d="M0 0h10"/></svg>')
  })

  it('strips a percentage-sized background rect', () => {
    const svg = '<svg viewBox="0 0 512 512"><rect width="100%" height="100%" fill="#123"/><path d="M0 0h10"/></svg>'
    expect(removeSvgBackgroundRect(svg)).not.toContain('<rect')
  })

  it('keeps a partial rect (a real shape, not a background)', () => {
    const svg = '<svg viewBox="0 0 512 512"><rect width="100" height="40" fill="#123"/></svg>'
    expect(removeSvgBackgroundRect(svg)).toBe(svg)
  })

  it('leaves rect-free vectors untouched', () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg>'
    expect(removeSvgBackgroundRect(svg)).toBe(svg)
  })
})

describe('svgNaturalSize', () => {
  it('prefers explicit width/height attributes', () => {
    expect(svgNaturalSize('<svg width="640" height="480" viewBox="0 0 10 10"></svg>')).toEqual({ width: 640, height: 480 })
  })

  it('falls back to the viewBox', () => {
    expect(svgNaturalSize(SAFE_SVG)).toEqual({ width: 200, height: 100 })
  })

  it('returns null when nothing usable is present', () => {
    expect(svgNaturalSize('<svg><path d="M0 0"/></svg>')).toBeNull()
  })
})
