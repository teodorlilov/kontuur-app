import { describe, expect, it } from 'vitest'
import { isSvg, sanitizeSvg } from '../svg'

describe('isSvg', () => {
  it('accepts real SVG markup', () => {
    expect(isSvg('<svg viewBox="0 0 10 10"><rect/></svg>')).toBe(true)
    expect(isSvg('<?xml version="1.0"?>\n<svg xmlns="...">')).toBe(true)
  })

  it('rejects non-SVG bodies (error pages, empty)', () => {
    expect(isSvg('<html><body>Not found</body></html>')).toBe(false)
    expect(isSvg('')).toBe(false)
    expect(isSvg('svgsomething')).toBe(false)
  })
})

describe('sanitizeSvg', () => {
  it('strips <script> tags', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>')
    expect(out).not.toContain('<script')
    expect(out).toContain('<rect/>')
  })

  it('strips event handlers', () => {
    const out = sanitizeSvg('<svg><rect onclick="steal()" onload=\'x()\' fill="#000"/></svg>')
    expect(out).not.toMatch(/onclick|onload/)
    expect(out).toContain('fill="#000"')
  })

  it('strips foreignObject (can embed HTML)', () => {
    const out = sanitizeSvg('<svg><foreignObject><body>hi</body></foreignObject><path/></svg>')
    expect(out).not.toContain('foreignObject')
    expect(out).toContain('<path/>')
  })

  it('strips javascript: hrefs but keeps normal ones', () => {
    const out = sanitizeSvg('<svg><a href="javascript:evil()"/><a href="#anchor"/></svg>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="#anchor"')
  })

  it('leaves a clean SVG untouched (aside from trim)', () => {
    const clean = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="#123456"/></svg>'
    expect(sanitizeSvg(`  ${clean}  `)).toBe(clean)
  })
})
