import { ensurePillarIds } from '@/lib/clients/content-pillars'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import type { UrlAnalysisResponse } from '@/types/api'
import type {
  DraftFieldId,
  DraftProfile,
  DraftResult,
  FieldProvenance,
} from '@/features/onboarding/types'
import type { ExtractionStatus } from '@/features/onboarding/hooks/use-extraction-status'

/**
 * The cadence a client starts on when nothing suggests otherwise.
 *
 * A default, not a detection — the sheet labels it "a starting cadence" rather than claiming the
 * site said so.
 */
export const DEFAULT_SCHEDULE = { day: 'monday', time: '09:00', count: '3' } as const

/** An empty profile: the blank form, for a client with no website to read. */
export function buildEmptyDraft(): DraftProfile {
  return {
    name: '',
    niche: '',
    audience: '',
    goal: '',
    tone: '',
    language: '',
    languageFormality: 'neutral',
    avoid: '',
    pillars: [],
    identity: buildDefaultIdentity(),
    schedule: { ...DEFAULT_SCHEDULE },
    isHealthNiche: false,
  }
}

/**
 * Turns one website read into a drafted client profile.
 *
 * Pure and synchronous: everything the sheet shows on arrival is decided here, so the drafting
 * rules are testable without rendering anything. The palette is deliberately *not* set from the
 * analysis — brand colours come from a separate extraction that is still running when this
 * returns, and the sheet upgrades the identity in place when it lands.
 *
 * A field is only given provenance if the analysis actually produced it. Anything missing is left
 * empty and listed in `unanswered`, which is what turns a row into a question rather than a blank
 * that looks drafted.
 */
export function buildDraftFromAnalysis(analysis: UrlAnalysisResponse): DraftResult {
  const provenance: Partial<Record<DraftFieldId, FieldProvenance>> = {}
  const unanswered: DraftFieldId[] = []
  const draft = buildEmptyDraft()

  function record(field: DraftFieldId, source: string, confidence: FieldProvenance['confidence']) {
    provenance[field] = { source, confidence }
  }

  if (analysis.detected_business_name) {
    draft.name = analysis.detected_business_name
    record('name', 'the page title', 'high')
  } else {
    unanswered.push('name')
  }

  if (analysis.detected_niche) {
    draft.niche = analysis.detected_niche
    record('niche', 'their services page', analysis.detected_niche_confidence)
  } else {
    unanswered.push('niche')
  }

  if (analysis.detected_target_audience.length > 0) {
    draft.audience = analysis.detected_target_audience.join(', ')
    record('audience', 'services and about pages', 'high')
  } else {
    unanswered.push('audience')
  }

  if (analysis.detected_tone) {
    draft.tone = analysis.detected_tone
    record('tone', 'their own copy', 'high')
  } else {
    unanswered.push('tone')
  }

  if (analysis.detected_language) {
    draft.language = analysis.detected_language
    draft.languageFormality = analysis.detected_language_formality || 'neutral'
    record('language', 'the site language', 'high')
  } else {
    unanswered.push('language')
  }

  if (analysis.detected_avoid_topics) {
    draft.avoid = analysis.detected_avoid_topics
    // Inferred from the sector rather than read off the page, so it is flagged for a second look.
    record('avoid', 'sector defaults', 'low')
  } else {
    unanswered.push('avoid')
  }

  if (analysis.detected_content_pillars.length > 0) {
    draft.pillars = ensurePillarIds(analysis.detected_content_pillars)
    record('mix', 'what they publish', 'high')
  } else {
    unanswered.push('mix')
  }

  // No detected_* field, and there could not be one: nothing on a website states what a post
  // should make someone do. Guessing would put a decision in the client's mouth, so this is
  // always the user's call.
  unanswered.push('goal')

  draft.isHealthNiche = analysis.detected_is_health_niche

  record('schedule', 'a starting cadence', 'low')
  record('style', 'the default system', 'low')

  return { draft, provenance, unanswered }
}

/**
 * What the palette row's chip should say, given how the colour read is going.
 *
 * Separate from `buildDraftFromAnalysis` because brand colours do not come from the page read at
 * all — they come from a job that is still running when the sheet first paints. Until it lands the
 * draft carries `DEFAULT_PALETTE`, and calling that "their brand colours" is the one claim this
 * sheet would be making without evidence. `undefined` while pending, because the row says it is
 * still reading rather than attributing a source it does not have.
 */
export function paletteProvenance(status: ExtractionStatus): FieldProvenance | undefined {
  if (status === 'pending') return undefined
  if (status === 'ready') return { source: "the site's own colours", confidence: 'high' }
  // `idle` covers the blank form, where no site was ever read.
  return { source: 'defaults, not read from the site', confidence: 'low' }
}
