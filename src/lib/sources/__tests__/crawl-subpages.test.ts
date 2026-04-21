import { describe, it, expect } from 'vitest'
import { extractLinksFromHtml } from '../crawl-subpages'

function html(links: string): string {
  return `<html><body>${links}</body></html>`
}

describe('extractLinksFromHtml', () => {
  const base = 'https://example.com/listings/'

  it('extracts anchor links from HTML', () => {
    const h = html(
      '<a href="https://example.com/property/a">Property A</a> <a href="https://example.com/property/b">Property B</a>'
    )
    expect(extractLinksFromHtml(h, base)).toEqual([
      'https://example.com/property/a',
      'https://example.com/property/b',
    ])
  })

  it('resolves relative URLs against base', () => {
    const h = html('<a href="/property/cool-house">Item</a>')
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/property/cool-house'])
  })

  it('filters out external links', () => {
    const h = html(
      '<a href="https://other-site.com/about">External</a><a href="https://example.com/about">Internal</a>'
    )
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/about'])
  })

  it('excludes navigation paths', () => {
    const h = html(`
      <a href="/page/2">Page 2</a>
      <a href="/tag/luxury">Tag</a>
      <a href="/category/apartments">Category</a>
      <a href="/search?q=test">Search</a>
      <a href="/login">Login</a>
      <a href="/property/nice-flat">Property</a>
    `)
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/property/nice-flat'])
  })

  it('deduplicates URLs', () => {
    const h = html('<a href="/property/a">A</a><a href="/property/a">A again</a>')
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/property/a'])
  })

  it('skips anchors, mailto, and tel links', () => {
    const h = html(
      '<a href="#top">Top</a><a href="mailto:test@x.com">Email</a><a href="tel:123">Phone</a><a href="/property/x">Real</a>'
    )
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/property/x'])
  })

  it('strips hash and query for dedup', () => {
    const h = html('<a href="/property/a#details">A</a><a href="/property/a?ref=123">B</a>')
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/property/a'])
  })

  it('skips the source page itself', () => {
    const h = html('<a href="/listings/">Self</a><a href="/property/a">Other</a>')
    expect(extractLinksFromHtml(h, base)).toEqual(['https://example.com/property/a'])
  })

  it('returns empty for HTML with no links', () => {
    expect(extractLinksFromHtml('<html><body>Just some text</body></html>', base)).toEqual([])
  })
})
