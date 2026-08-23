import { discoverSitemapUrls } from './discover-sitemap'
import { fetchPages, fetchWebsiteSource, type PageExcerpt } from './fetch-website'

/** Pages sent to the analyser, the entry page included. */
const MAX_PAGES = 4
/** Pages fetched to choose between. Fetching is what reveals which ones actually say something. */
const MAX_CANDIDATES = 6
/** Per-page share of the analyser's budget, so one long page cannot crowd out three others. */
const PER_PAGE_CHARS = 3000

/** `/en/`, `/bg/`, `/en-gb/` — a locale mirror rather than another page of the same site. */
const LOCALE_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/i

function localeOf(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0]
  return first && LOCALE_SEGMENT.test(first) ? first.toLowerCase() : null
}

/**
 * Which discovered URLs are worth fetching, given the page the user actually typed.
 *
 * Same origin, because a sitemap can list anything and this ends up in an outbound fetch. Same
 * locale, because a site with an `/en/` mirror will otherwise hand back its English pages for a
 * client whose market is not English — and `detected_language` drives the language of every post
 * generated from then on, so that mistake is invisible and total.
 *
 * Shallow paths first: `/services/` is the substance, `/services/case-study-2019/` is a leaf. It
 * is a tie-break, not a judgement — which pages are worth reading is settled by fetching them.
 */
export function selectCandidatePages(entryUrl: string, discovered: string[]): string[] {
  const entry = new URL(entryUrl)
  const entryLocale = localeOf(entry.pathname)

  return discovered
    .flatMap((raw) => {
      let url: URL
      try {
        url = new URL(raw)
      } catch {
        return []
      }
      if (url.origin !== entry.origin) return []
      if (url.pathname.replace(/\/$/, '') === entry.pathname.replace(/\/$/, '')) return []
      if (localeOf(url.pathname) !== entryLocale) return []
      // Decoded, because the tie-break is on how long the slug reads, not how long it encodes:
      // `/студиото/` arrives as 54 percent-escaped characters and would lose every comparison to
      // an ASCII slug twice its actual length. On the site this was built against that page is the
      // one describing the business, and the raw-length sort dropped it off the end of the list.
      const path = decodeURIComponent(url.pathname)
      return [
        { url: url.toString(), depth: path.split('/').filter(Boolean).length, len: path.length },
      ]
    })
    .sort((a, b) => a.depth - b.depth || a.len - b.len)
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => candidate.url)
}

/** The entry page first, then the richest of the rest — ranked by how much they actually said. */
function rank(entry: PageExcerpt | null, others: PageExcerpt[]): PageExcerpt[] {
  const best = [...others].sort((a, b) => b.markdown.length - a.markdown.length)
  return [...(entry ? [entry] : []), ...best].slice(0, MAX_PAGES)
}

/**
 * Read a representative sample of a site for brand analysis.
 *
 * A homepage is the worst page to judge a business by and the one every user pastes: it is a hero
 * and a nav bar, and on one real client it yielded 316 characters of content while every other
 * page on the site had real copy. The site's own sitemap already lists those pages, and onboarding
 * already fetches it for the sources step — this reads it for the analysis too.
 *
 * The entry page is always included when it is readable: it is the page the user chose, and it
 * carries the business name and tagline even when it carries nothing else.
 *
 * Falls back to the entry page alone when there is no sitemap or nothing else survives, which is
 * exactly the behaviour this replaced — a site without a sitemap is no worse off than before.
 */
export async function fetchSiteProfile(url: string): Promise<{ content: string; error?: string }> {
  const [entry, discovered] = await Promise.all([
    fetchWebsiteSource(url),
    discoverSitemapUrls(url).catch(() => ({ urls: [] as string[] })),
  ])

  const entryExcerpt: PageExcerpt | null =
    entry.error || !entry.markdown ? null : { url, markdown: entry.markdown }

  const candidates = selectCandidatePages(url, discovered.urls)
  const others = candidates.length > 0 ? await fetchPages(candidates) : []
  const chosen = rank(entryExcerpt, others)

  if (chosen.length === 0) {
    return { content: '', error: entry.error ?? 'No readable content found' }
  }

  // Labelled by path so the model can tell one page from the next, and so a services page reads as
  // a services page rather than as more of the homepage.
  const content = chosen
    .map((page) => `## ${new URL(page.url).pathname}\n${page.markdown.slice(0, PER_PAGE_CHARS)}`)
    .join('\n\n')

  return { content }
}
