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
