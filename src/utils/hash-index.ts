/**
 * Stable bucket index for a name, so the same string always picks the same slot.
 *
 * Shared by the two identity palettes — client avatars and content pillars —
 * because DESIGN.md § Client Identity requires the assignment to key off the
 * item's own name rather than its position in a list. Two copies of this would
 * drift, and a client that changes colour when you paginate has turned
 * decoration into a false signal.
 */
export function hashIndex(value: string, buckets: number): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash % buckets
}
