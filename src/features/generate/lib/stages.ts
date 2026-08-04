/** The four stages the generation stream moves through, as the progress rail names them. */
export const STAGE_LABELS = [
  'Fetching sources',
  'Researching topics',
  'Writing captions and slides',
  'Quality checks',
] as const

/** Stage labels for the single-post idea flow. */
export const IDEA_STAGE_LABELS = [
  'Searching for sources',
  'Enriching idea',
  'Writing post',
  'Quality checks',
] as const

/** Maps streaming phase strings to discrete stage indices (0-3). */
export function mapPhaseToStage(phase: string): number {
  const lower = phase.toLowerCase()
  if (lower.includes('quality') || lower.includes('validat') || lower.includes('check')) return 3
  if (lower.includes('generat') || lower.includes('writ') || lower.includes('caption')) return 2
  if (
    lower.includes('pillar') ||
    lower.includes('research') ||
    lower.includes('theme') ||
    lower.includes('analyz')
  )
    return 1
  return 0
}
