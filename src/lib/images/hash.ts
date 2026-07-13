import { createHash } from 'node:crypto'
import { canonicalize } from '@/lib/render/hash'

/**
 * A stable cache key for a generated plate, computed from *deterministic* inputs (the slide copy + the
 * brand's art-direction context) — never from the LLM-composed scene, which varies run to run. So the
 * same slide + brand reuses the same image across regenerations and posts; only changed copy regenerates.
 */
export function promptHash(input: unknown): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex')
}

/** A fixed per-brand seed so a brand's generated images share a consistent look. Derived from the client
 *  id, so it's stable without storing anything. */
export function seedFromClient(clientId: string): number {
  return parseInt(createHash('sha256').update(clientId).digest('hex').slice(0, 8), 16)
}
