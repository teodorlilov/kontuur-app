import type { GenerationResult } from '@/ai/generation/types'
import type { SkippedPillar } from '@/ai/research/types'

/**
 * The four stages the progress rail moves through.
 *
 * Named here rather than left as bare indices because the server now states which
 * one it is in. It used to be inferred from the phase *prose* by substring match,
 * which was wrong in both directions: stage 3 was unreachable — no phase string
 * contained quality/validat/check — and "Generating theme ideas…" matched
 * `includes('generat')` before the research branch, so research reported itself as
 * writing. `setLoadingStage` is `Math.max`-monotonic, so that first wrong guess
 * then stuck for the rest of the run.
 */
export const GENERATION_STAGES = ['sources', 'research', 'writing', 'quality'] as const

export type GenerationStage = (typeof GENERATION_STAGES)[number]

export function stageIndex(stage: GenerationStage): number {
  return GENERATION_STAGES.indexOf(stage)
}

/**
 * The generate stream's wire contract.
 *
 * One definition, imported by the route that writes it and the flow that reads it.
 * It was written out in both files and had already drifted — the client typed
 * `result.data` as `GenerationResult` while the server typed it `unknown` — so a
 * field added on one side was invisible to the other.
 */
export type UnifiedStreamEvent =
  | { type: 'total'; count: number }
  | { type: 'phase'; message: string; stage: GenerationStage }
  | { type: 'result'; data: GenerationResult }
  | { type: 'skipped_pillars'; pillars: SkippedPillar[]; skippedCount: number }
  | { type: 'error'; message: string }
