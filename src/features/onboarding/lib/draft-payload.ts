import { serializePillars } from '@/lib/clients/content-pillars'
import { snapTimeToHour } from '@/utils/date-helpers'
import type { CreateClientInput } from '@/features/clients/schemas'
import type { SourceKind } from '@/types/visual'
import { buildEmptyDraft } from '@/features/onboarding/lib/build-draft'
import { DRAFT_FIELD_ORDER } from '@/features/onboarding/lib/draft-rows'
import type { DraftFieldId, DraftProfile } from '@/features/onboarding/types'

/** Whether a field now holds something worth counting as answered. */
export function hasValue(draft: DraftProfile, field: DraftFieldId): boolean {
  switch (field) {
    case 'name':
      return draft.name.trim() !== ''
    case 'niche':
      return draft.niche.trim() !== ''
    case 'audience':
      return draft.audience.trim() !== ''
    case 'goal':
      return draft.goal.trim() !== ''
    case 'tone':
      return draft.tone.trim() !== ''
    case 'language':
      return draft.language.trim() !== ''
    case 'avoid':
      return draft.avoid.trim() !== ''
    case 'mix':
      return draft.pillars.some((pillar) => pillar.pillar.trim() !== '')
    // Schedule, palette and style always hold a value — they start from documented defaults
    // rather than from nothing. Spelled out rather than left to a `default:` so that adding a
    // field to DraftFieldId is a compile error here instead of silently counting as answered.
    case 'schedule':
    case 'palette':
    case 'style':
      return true
  }
}

/**
 * The fields an empty draft does not already answer.
 *
 * The blank form's denominator, where "filled" has to mean the user filled it — counting the three
 * default-carrying rows opened the form at "3 of 12" before it had been touched. Derived from
 * `hasValue` rather than listed by hand, so the counter and the save gate cannot disagree about
 * what counts as answered.
 */
export const ANSWERABLE_FIELDS: readonly DraftFieldId[] = DRAFT_FIELD_ORDER.filter(
  (field) => !hasValue(buildEmptyDraft(), field)
)

/** How many of the sheet's fields the user has actually filled. Drives the blank form's counter. */
export function countFilled(draft: DraftProfile, fields: readonly DraftFieldId[]): number {
  return fields.filter((field) => hasValue(draft, field)).length
}

/**
 * What still stops this client being saved, in the order the sheet asks about it.
 *
 * The save bar used to announce "1 thing needs your call" beside an enabled Save button, which
 * made the sentence decorative — the flow's whole promise is that you check what the site could
 * not work out, and it cannot enforce that by asking nicely.
 *
 * Only two things block: a missing name, because `createClient` rejects it and a click that fails
 * is worse than a button that explains itself; and any question the sheet raised that has not been
 * answered. Fields the site simply left thin do not block — they were never asked about, and the
 * profile stays editable forever.
 */
export function blockingFields(
  draft: DraftProfile,
  unanswered: readonly DraftFieldId[]
): DraftFieldId[] {
  const blocking = unanswered.filter((field) => !hasValue(draft, field))
  if (!hasValue(draft, 'name') && !blocking.includes('name')) blocking.unshift('name')
  return blocking
}

/**
 * The draft, as the shape `createClient` writes.
 *
 * One place where the sheet's flat, UI-shaped draft becomes the four database groups. Empty
 * strings become `null` rather than being stored as blanks, so "not set" reads the same whether a
 * field was never drafted or was cleared by hand.
 */
export function buildCreateInput(
  draft: DraftProfile,
  websiteUrl: string,
  identitySource: SourceKind
): CreateClientInput {
  const postsPerWeek = parseInt(draft.schedule.count, 10) || 1

  return {
    name: draft.name.trim(),
    niche: draft.niche.trim() || null,
    language: draft.language.trim() || 'English',
    website_url: websiteUrl.trim() || null,
    posts_per_week: postsPerWeek,
    brand_profile: {
      tone: draft.tone.trim() || null,
      target_audience: draft.audience.trim() || null,
      social_goals: draft.goal.trim() || null,
      content_pillars: draft.pillars.length > 0 ? serializePillars(draft.pillars) : null,
      avoid_topics: draft.avoid.trim() || null,
      language_formality: draft.languageFormality || 'neutral',
      is_health_niche: draft.isHealthNiche,
    },
    posting_schedule: {
      is_active: true,
      frequency_type: 'per_week',
      frequency_value: postsPerWeek,
      auto_generate_day: draft.schedule.day,
      auto_generate_time: snapTimeToHour(draft.schedule.time),
    },
    visual_identity: draft.identity,
    visual_identity_source: identitySource,
  }
}
