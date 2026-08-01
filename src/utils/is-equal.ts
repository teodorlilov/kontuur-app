/**
 * Structural equality for plain data — primitives, arrays and plain objects.
 *
 * Exists for dirty-tracking form drafts: comparing a draft against the values it loaded with is
 * what decides whether the save bar appears, and reference equality would report every re-render
 * as a change. Not a general-purpose deep-equal — it does not handle Map, Set, Date or cycles,
 * because form drafts contain none of those.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => isEqual(item, b[i]))
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  )
}
