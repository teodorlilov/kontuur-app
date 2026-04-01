/**
 * Deterministic color mapping for content pillars.
 * Same pillar name always gets the same color via stable hash.
 */

interface PillarColorSet {
  bg: string
  text: string
  hex: string
}

const PILLAR_COLORS: readonly PillarColorSet[] = [
  { bg: 'bg-violet-50', text: 'text-violet-700', hex: '#7C3AED' },
  { bg: 'bg-sky-50', text: 'text-sky-700', hex: '#0284C7' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', hex: '#059669' },
  { bg: 'bg-rose-50', text: 'text-rose-700', hex: '#E11D48' },
  { bg: 'bg-amber-50', text: 'text-amber-700', hex: '#D97706' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', hex: '#0891B2' },
] as const

/**
 * Simple string hash for deterministic color assignment.
 * Produces a consistent non-negative integer for any string.
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Get Tailwind classes and hex color for a pillar name.
 * Uses a stable hash so the same pillar always maps to the same color.
 */
export function getPillarColor(pillar: string): PillarColorSet {
  const index = hashString(pillar) % PILLAR_COLORS.length
  return PILLAR_COLORS[index] as PillarColorSet
}
