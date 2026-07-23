import { FONT_LIBRARY, getFontEntry } from '@/lib/canvas/font-library'
import { editorFontsHref } from '@/lib/canvas/google-fonts'

// Stylesheet covering the whole editor library — binaries only download once text uses them.
function libraryStylesheetHref(): string | null {
  return editorFontsHref(FONT_LIBRARY)
}

/**
 * Append the library stylesheet `<link>` to `<head>` imperatively, deduped by href. Kept OUT of
 * React's render tree — React 19 treats `<link rel="stylesheet">` as a hoistable resource and
 * reconciles it against the SSR `<head>`, which throws hydration error #418 when a client-only
 * surface mounts one. Links persist (removing them causes a flash of unstyled text).
 */
export function injectLibraryStylesheet(): void {
  if (typeof document === 'undefined') return
  const href = libraryStylesheetHref()
  if (!href || document.head.querySelector(`link[data-editor-fonts="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.setAttribute('data-editor-fonts', href)
  document.head.appendChild(link)
}

// document.fonts.load is idempotent but not free; memoize per "weight family" load key.
const loaded = new Map<string, Promise<unknown>>()

/**
 * Resolve when every given family (library weights; unknown families skipped — they render with a
 * system fallback) is ready to measure and rasterize. Must be awaited before the first stage draw
 * AND inside the exporter, or a system face gets baked silently.
 */
export async function ensureFontsReady(families: string[]): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const loads: Promise<unknown>[] = []
  for (const family of new Set(families)) {
    const entry = getFontEntry(family)
    if (!entry) continue
    for (const weight of entry.weights) {
      const key = `${weight} 48px "${family}"`
      let promise = loaded.get(key)
      if (!promise) {
        promise = document.fonts.load(key).catch(() => undefined)
        loaded.set(key, promise)
      }
      loads.push(promise)
    }
  }
  await Promise.all(loads)
}
