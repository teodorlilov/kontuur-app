import { createHash } from 'node:crypto'

/** Stable JSON with recursively sorted object keys, so semantically-equal inputs stringify equal. */
function canonicalize(value: unknown): string {
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
 * A stable cache key for a generated backdrop, from **deterministic** inputs only (preset/model/role/palette
 * + cover/CTA copy, or the per-carousel seed for interiors) — never the LLM scene, which varies run to run.
 * So the same brand + copy reuses the image across regenerations; changed copy/preset regenerates.
 */
export function promptHash(input: unknown): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex')
}

/** A stable numeric seed from an id (post/draft) — deterministic per post, so a carousel's images share a
 *  consistent look and regeneration is reproducible without persisting anything. */
export function seedFromId(id: string): number {
  return parseInt(createHash('sha256').update(id).digest('hex').slice(0, 8), 16)
}
