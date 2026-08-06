/**
 * Removes one-shot query params from the address bar without a navigation.
 *
 * Next patches `history.replaceState` so `useSearchParams` re-reads after any URL write. An effect
 * that handles an OAuth result param and leaves it in the URL therefore fires again the next time
 * anything touches the query string, showing the same toast a second time.
 */
export function clearQueryParams(keys: string[]): void {
  const url = new URL(window.location.href)
  if (!keys.some((key) => url.searchParams.has(key))) return

  for (const key of keys) url.searchParams.delete(key)
  window.history.replaceState(null, '', url)
}

/**
 * Turns what a person types into something `fetch` and `new URL` accept.
 *
 * The onboarding field shows a `https://` prefix beside the input, so people type a bare host —
 * and a bare host is not a URL. `fetch('haelan.bg')` throws "Failed to parse URL" and
 * `new URL('haelan.bg')` throws, which surfaced as a 422 from the site read and a 400 from source
 * discovery: two failures with one cause. Normalising here means the decorative prefix and the
 * value actually agree.
 *
 * An existing scheme is preserved, so pasting a full `http://` URL is not silently upgraded.
 */
export function toWebsiteUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** The inverse, for display: `https://www.haelan.bg/` → `www.haelan.bg`. */
export function toHostLabel(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

/**
 * Source attribution label: `https://www.bbc.co.uk/news/x` → `bbc.co.uk`.
 *
 * Unlike toHostLabel this parses the URL, so a malformed source_url yields null
 * and the caller can omit the attribution rather than print a broken string.
 */
export function toSourceHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
