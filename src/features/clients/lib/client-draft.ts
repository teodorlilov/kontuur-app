import { parsePillars, serializePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { snapTimeToHour } from '@/utils/date-helpers'
import type { UpdateClientInput } from '@/features/clients/schemas'
import type { BrandProfileRow, ClientRow, PostingScheduleRow } from '@/types'
import type { VisualIdentity } from '@/types/visual'

/**
 * `weekly_mix_json` mixes two kinds of key: one platform name, plus post-format shares.
 * Reading and writing both need to tell them apart, so the set is declared once.
 */
const MIX_FORMAT_KEYS = new Set(['carousel', 'single'])

export interface ClientDraft {
  name: string
  niche: string
  language: string
  websiteUrl: string
  contactEmail: string
  postsPerWeek: string
}

export interface BrandDraft {
  tone: string
  targetAudience: string
  /** What a post should get someone to do. Comma-separated, like targetAudience. */
  socialGoals: string
  contentPillars: WeightedPillar[]
  avoidTopics: string
  languageFormality: string
  secondaryLanguage: string
  isHealthNiche: boolean
  languageNotes: string
  defaultPostType: string
  defaultCarouselSlides: string
}

export interface ScheduleDraft {
  isActive: boolean
  freqValue: string
  autoDay: string
  autoTime: string
}

export interface ClientDrafts {
  client: ClientDraft
  brand: BrandDraft
  schedule: ScheduleDraft
  identity: VisualIdentity
}

/**
 * The language pair as every surface states it: the language, then the register it is written in.
 *
 * One function because the two are never shown apart — the settings header and the re-read's
 * comparison row would otherwise drift in separator or order while describing the same two fields.
 * Empty when there is no language, so a caller renders nothing rather than a bare separator.
 */
export function describeLanguage(language: string, formality: string): string {
  return language ? `${language} · ${formality}` : ''
}

/** Which draft groups differ from the values the form loaded with. */
export interface DirtyGroups {
  client: boolean
  brand: boolean
  schedule: boolean
  identity: boolean
}

type ClientRowInput = Omit<ClientRow, 'agency_id'>
type ProfileRowInput = Omit<BrandProfileRow, 'client_id'> | null
type ScheduleRowInput = Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null

/** Turns the loaded rows into editable drafts. Also the baseline the dirty check compares against. */
export function buildDrafts(
  client: ClientRowInput,
  profile: ProfileRowInput,
  schedule: ScheduleRowInput,
  identity: VisualIdentity | null
): ClientDrafts {
  return {
    client: {
      name: client.name,
      niche: client.niche ?? '',
      language: client.language,
      websiteUrl: client.website_url ?? '',
      contactEmail: client.contact_email ?? '',
      postsPerWeek: String(client.posts_per_week),
    },
    brand: {
      tone: profile?.tone ?? '',
      targetAudience: profile?.target_audience ?? '',
      socialGoals: profile?.social_goals ?? '',
      contentPillars: parsePillars(profile?.content_pillars ?? null),
      avoidTopics: profile?.avoid_topics ?? '',
      languageFormality: profile?.language_formality ?? 'neutral',
      secondaryLanguage: profile?.secondary_language ?? '',
      isHealthNiche: profile?.is_health_niche ?? false,
      languageNotes: profile?.language_notes ?? '',
      defaultPostType: profile?.default_post_type ?? 'single',
      defaultCarouselSlides: String(profile?.default_carousel_slides ?? 6),
    },
    schedule: {
      isActive: schedule?.is_active ?? true,
      freqValue: String(schedule?.frequency_value ?? 3),
      autoDay: schedule?.auto_generate_day ?? 'monday',
      autoTime: snapTimeToHour(schedule?.auto_generate_time),
    },
    identity: identity ?? buildDefaultIdentity(),
  }
}

/**
 * Builds the save payload from the groups that actually changed.
 *
 * Scoped on purpose: an unconditional write re-upserts the visual identity as `manual`, stamping
 * a measured palette as hand-edited when nobody touched it.
 */
export function buildUpdatePayload(
  drafts: ClientDrafts,
  dirty: DirtyGroups,
  originalMix: unknown
): UpdateClientInput {
  const payload: UpdateClientInput = {}

  if (dirty.client) {
    payload.name = drafts.client.name.trim()
    payload.niche = drafts.client.niche || null
    payload.language = drafts.client.language
    payload.website_url = drafts.client.websiteUrl || null
    payload.contact_email = drafts.client.contactEmail || null
    payload.posts_per_week = parseInt(drafts.client.postsPerWeek, 10)
  }

  if (dirty.brand) {
    const { brand } = drafts
    payload.brand_profile = {
      tone: brand.tone || null,
      target_audience: brand.targetAudience || null,
      social_goals: brand.socialGoals || null,
      content_pillars:
        brand.contentPillars.length > 0 ? serializePillars(brand.contentPillars) : null,
      avoid_topics: brand.avoidTopics || null,
      language_formality: brand.languageFormality,
      secondary_language: brand.secondaryLanguage || null,
      is_health_niche: brand.isHealthNiche,
      language_notes: brand.languageNotes || null,
      default_post_type: brand.defaultPostType,
      default_carousel_slides: parseInt(brand.defaultCarouselSlides, 10),
      // Format shares only. The platform key that used to be merged in beside them left with
      // `activePlatform` — the column now holds what to make, never where to send it.
      weekly_mix_json: keepFormatKeys(readMix(originalMix)),
    }
  }

  if (dirty.schedule) {
    payload.posting_schedule = {
      is_active: drafts.schedule.isActive,
      frequency_value: parseInt(drafts.schedule.freqValue, 10),
      auto_generate_day: drafts.schedule.autoDay,
      auto_generate_time: drafts.schedule.autoTime,
    }
  }

  if (dirty.identity) {
    payload.visual_identity = drafts.identity
  }

  return payload
}

/** Narrows the stored Json column to a numeric map without asserting. */
function readMix(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
  )
}

/** Drops the platform key, keeping the format shares an update must not clobber. */
function keepFormatKeys(mix: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(mix).filter(([key]) => MIX_FORMAT_KEYS.has(key)))
}
