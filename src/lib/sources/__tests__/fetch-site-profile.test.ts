import { describe, it, expect } from 'vitest'
import { selectCandidatePages } from '../fetch-site-profile'

const ENTRY = 'https://aboutsocialmedia.io/'

/** The real sitemap of the client this was built for: Bulgarian pages plus a full English mirror. */
const SITEMAP = [
  'https://aboutsocialmedia.io/',
  'https://aboutsocialmedia.io/reklamni-uslugi/',
  'https://aboutsocialmedia.io/video-produktsiya/',
  'https://aboutsocialmedia.io/brand-identichnost/',
  'https://aboutsocialmedia.io/en/marketing-services/',
  'https://aboutsocialmedia.io/en/about/',
  'https://aboutsocialmedia.io/en/the-team/',
]

describe('selectCandidatePages', () => {
  it('never returns the page the user already gave us', () => {
    expect(selectCandidatePages(ENTRY, SITEMAP)).not.toContain(ENTRY)
  })

  it('skips a locale mirror when the entry page is not in one', () => {
    // The trap this guard exists for: /en/about/ and /en/marketing-services/ are the pages an
    // English keyword match would pick, and reading them sets detected_language to English for a
    // Bulgarian-market client — which then decides the language of every post generated for them.
    const picked = selectCandidatePages(ENTRY, SITEMAP)
    expect(picked.every((url) => !url.includes('/en/'))).toBe(true)
    expect(picked).toContain('https://aboutsocialmedia.io/reklamni-uslugi/')
  })

  it('stays inside the locale the entry page is in', () => {
    const picked = selectCandidatePages('https://aboutsocialmedia.io/en/homepage/', SITEMAP)
    expect(picked).toContain('https://aboutsocialmedia.io/en/about/')
    expect(picked.every((url) => url.includes('/en/'))).toBe(true)
  })

  it('refuses a foreign origin, whatever the sitemap claims', () => {
    // The result of this goes straight into an outbound fetch, and a sitemap is not ours to trust.
    expect(selectCandidatePages(ENTRY, ['https://evil.example/admin'])).toEqual([])
  })

  it('ignores entries that are not URLs at all', () => {
    expect(selectCandidatePages(ENTRY, ['not a url', '/relative/path'])).toEqual([])
  })

  it('treats a trailing slash as the same page', () => {
    expect(selectCandidatePages('https://x.test/about', ['https://x.test/about/'])).toEqual([])
  })

  it('ranks a non-Latin slug by how it reads, not by how it encodes', () => {
    // `/студиото/` is 54 characters once percent-escaped and 10 decoded. Sorting on the raw string
    // pushed the one page describing that business past the candidate cap entirely.
    const picked = selectCandidatePages('https://x.test/', [
      'https://x.test/%D1%81%D1%82%D1%83%D0%B4%D0%B8%D0%BE%D1%82%D0%BE/',
      'https://x.test/a-somewhat-longer-slug/',
    ])
    expect(decodeURIComponent(picked[0]!)).toBe('https://x.test/студиото/')
  })

  it('prefers shallower paths, so sections come before their leaves', () => {
    const picked = selectCandidatePages('https://x.test/', [
      'https://x.test/services/case-study-2019/',
      'https://x.test/services/',
    ])
    expect(picked[0]).toBe('https://x.test/services/')
  })

  it('caps how many pages it is willing to fetch', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://x.test/page-${i}/`)
    expect(selectCandidatePages('https://x.test/', many).length).toBeLessThanOrEqual(6)
  })
})
