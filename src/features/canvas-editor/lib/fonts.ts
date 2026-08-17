import { FONT_LIBRARY, getFontEntry, type FontEntry } from '@/lib/canvas/font-library'
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

// document.fonts.load is idempotent but not free; memoize per "style weight family" load key.
const loaded = new Map<string, Promise<unknown>>()

// Every face the family serves: each weight upright, plus italic where the library hosts one.
function faceLoadKeys(entry: FontEntry): string[] {
  return entry.weights.flatMap((weight) => [
    `${weight} 48px "${entry.family}"`,
    ...(entry.italic ? [`italic ${weight} 48px "${entry.family}"`] : []),
  ])
}

/**
 * One character from each Unicode subset this family actually serves.
 *
 * `document.fonts.load(font)` defaults its text to a single space, and Google splits each family
 * into per-script `@font-face` rules whose Cyrillic `unicode-range` does NOT contain U+0020 — so a
 * bare call resolves having awaited only the Latin binary. Cyrillic text is then measured against
 * whatever the OS substitutes, and because `autofitDocText` writes its measurement back into the
 * doc, the wrong `fontSize` is PERSISTED rather than merely drawn once.
 *
 * Derived from the library's own `cyrillic` flag rather than probing every family with Cyrillic:
 * a Latin-only family has no Cyrillic face to wait for, and forcing the probe would download a
 * subset nothing will ever paint.
 *
 * Invariant the memo below depends on: this is a function of the FAMILY alone. If it ever varies
 * per call, the probe has to join the cache key with it.
 */
function probeText(entry: FontEntry): string {
  return entry.cyrillic ? 'Aа' : 'A'
}

/**
 * Resolve when every given family (library weights + italics; unknown families skipped — they
 * render with a system fallback) is ready to measure and rasterize. Must be awaited before the
 * first stage draw AND inside the exporter, or a system face gets baked silently.
 */
export async function ensureFontsReady(families: string[]): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const loads: Promise<unknown>[] = []
  for (const family of new Set(families)) {
    const entry = getFontEntry(family)
    if (!entry) continue
    const probe = probeText(entry)
    for (const key of faceLoadKeys(entry)) {
      let promise = loaded.get(key)
      if (!promise) {
        promise = document.fonts.load(key, probe).catch(() => undefined)
        loaded.set(key, promise)
      }
      loads.push(promise)
    }
  }
  await Promise.all(loads)
}
