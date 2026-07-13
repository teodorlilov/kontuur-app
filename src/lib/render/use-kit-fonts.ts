import { useEffect } from 'react'

/**
 * Load kit font stylesheet(s) by appending `<link rel="stylesheet">` to `<head>` imperatively, deduped by
 * href. This keeps the font links OUT of React's render tree — React 19 treats `<link rel="stylesheet">`
 * as a hoistable resource and reconciles it against the SSR-rendered `<head>`, which throws a hydration
 * mismatch (minified error #418) when a client-only surface (the onboarding preview, review, etc.) mounts
 * one. Links persist (fonts are cheap to keep; removing them on unmount causes a flash of unstyled text).
 */
export function useKitFonts(href: string | null | undefined | Array<string | null | undefined>): void {
  const hrefs = (Array.isArray(href) ? href : [href]).filter((h): h is string => Boolean(h))
  const key = hrefs.join('|')

  useEffect(() => {
    if (typeof document === 'undefined') return
    const existing = new Set(
      Array.from(document.head.querySelectorAll('link[data-kit-fonts]')).map((l) => l.getAttribute('data-kit-fonts'))
    )
    for (const h of hrefs) {
      if (existing.has(h)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = h
      link.setAttribute('data-kit-fonts', h)
      document.head.appendChild(link)
    }
    // hrefs is derived from `key`; re-run only when the set of hrefs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
