import { GENERATION_STAGES, type GenerationStage } from './stream-events'

/**
 * What the progress rail calls each stage.
 *
 * One set for every run. There used to be a second, `IDEA_STAGE_LABELS`, because
 * generating from a client idea was a separate endpoint with a different shape —
 * its second label was "Enriching idea", naming a shallow lookup that no longer
 * exists. An idea is now a locked priority brief on the same pipeline, so it moves
 * through the same four stages and a second vocabulary would only describe a flow
 * that is gone.
 */
export const STAGE_LABELS: Record<GenerationStage, string> = {
  sources: 'Fetching sources',
  research: 'Researching topics',
  writing: 'Writing captions and slides',
  quality: 'Quality checks',
}

export const ORDERED_STAGE_LABELS = GENERATION_STAGES.map((stage) => STAGE_LABELS[stage])
