/**
 * SVG safety gate for AI-generated vectors. Policy is REJECTION, not stripping: a machine-made
 * vector containing active content is discarded outright (regenerating costs cents; a sanitizer
 * bug costs an XSS). Defense-in-depth — the files render via <img>, which never executes
 * scripts, but stored assets should be inert regardless of how they are consumed later.
 */

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script/i, reason: 'contains a script element' },
  { pattern: /\son\w+\s*=/i, reason: 'contains an event handler attribute' },
  { pattern: /javascript:/i, reason: 'contains a javascript: URL' },
  { pattern: /<foreignObject/i, reason: 'contains a foreignObject element' },
  { pattern: /<iframe|<embed|<object/i, reason: 'contains an embedded document element' },
  { pattern: /data:text\/html/i, reason: 'contains an HTML data URL' },
  // External references may exfiltrate or load remote content; local #fragment refs are fine.
  { pattern: /(?:xlink:)?href\s*=\s*["'](?!#)/i, reason: 'references an external resource' },
]

/** Why the SVG must be rejected, or null when it is safe to store. */
export function svgRejectionReason(svg: string): string | null {
  if (!/<svg[\s>]/i.test(svg)) return 'is not an SVG document'
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(svg)) return reason
  }
  return null
}

/** A background rect must cover at least this share of the canvas to be treated as one. */
const BACKGROUND_RECT_MIN_COVERAGE = 0.98

/**
 * Strip a generated vector's full-canvas background rectangle so the graphic sits on
 * transparency (generators routinely paint one). Heuristic: remove the FIRST <rect> whose
 * width/height cover ~the whole canvas (absolute or percentage units). The vector itself stays
 * untouched — no rasterization. Returns the input unchanged when no such rect exists.
 */
export function removeSvgBackgroundRect(svg: string): string {
  const natural = svgNaturalSize(svg)
  const rectMatch = svg.match(/<rect\b[^>]*\/?>(?:\s*<\/rect>)?/i)
  if (!rectMatch) return svg
  const rect = rectMatch[0]
  const width = rect.match(/\swidth\s*=\s*["']?([\d.]+%?)/i)?.[1]
  const height = rect.match(/\sheight\s*=\s*["']?([\d.]+%?)/i)?.[1]
  if (!width || !height) return svg

  const covers = (value: string, full: number | undefined): boolean => {
    if (value.endsWith('%')) return Number(value.slice(0, -1)) >= BACKGROUND_RECT_MIN_COVERAGE * 100
    return full !== undefined && Number(value) >= full * BACKGROUND_RECT_MIN_COVERAGE
  }
  if (!covers(width, natural?.width) || !covers(height, natural?.height)) return svg
  return svg.replace(rect, '')
}

/**
 * The vector's natural dimensions for initial element sizing — from width/height attributes or
 * the viewBox. Null when neither is present (caller falls back to a square).
 */
export function svgNaturalSize(svg: string): { width: number; height: number } | null {
  const open = svg.match(/<svg[^>]*>/i)?.[0]
  if (!open) return null
  const width = Number(open.match(/\swidth\s*=\s*["']?([\d.]+)/i)?.[1])
  const height = Number(open.match(/\sheight\s*=\s*["']?([\d.]+)/i)?.[1])
  if (width > 0 && height > 0) return { width, height }
  const viewBox = open.match(/\sviewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  const vbWidth = Number(viewBox?.[1])
  const vbHeight = Number(viewBox?.[2])
  if (vbWidth > 0 && vbHeight > 0) return { width: vbWidth, height: vbHeight }
  return null
}
