import { createHash } from 'node:crypto'

/**
 * Bump when a renderer change should re-render every existing slide (a layout bugfix, a new
 * default). It is folded into `renderHash`, so raising it dirties every cached PNG on next request.
 */
export const RENDERER_VERSION = 1

/** Stable JSON with recursively sorted object keys, so semantically-equal graphs stringify equal. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) sorted[key] = sortValue(source[key])
    return sorted
  }
  return value
}

/**
 * The cache key for a rendered slide: `sha256(canonical(composition) + brand_kit_version +
 * rendererVersion)`. The version terms are essential — without `brand_kit_version` a rebrand would
 * silently reuse the old PNG; without `RENDERER_VERSION` a renderer fix would never re-render.
 */
export function renderHash(compositionJson: unknown, brandKitVersion: number): string {
  const input = `${canonicalize(compositionJson)}|${brandKitVersion}|${RENDERER_VERSION}`
  return createHash('sha256').update(input).digest('hex')
}
