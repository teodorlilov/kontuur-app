import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { VisualIdentity } from '@/types/visual'

/** Every field the draft sheet shows. Mirrors `DRAFT_ROWS` in lib/draft-rows.ts. */
export type DraftFieldId =
  | 'name'
  | 'niche'
  | 'audience'
  | 'goal'
  | 'tone'
  | 'language'
  | 'avoid'
  | 'mix'
  | 'palette'
  | 'style'
  | 'schedule'
  | 'platform'

/** When posts are generated. `day` is a `WEEKDAY_OPTIONS` value; `time` is 24h `HH:mm`. */
export interface DraftSchedule {
  day: string
  time: string
  count: string
}

/**
 * The whole client profile as the sheet edits it.
 *
 * Flat and UI-shaped on purpose: the sheet is one screen of fields, and mapping to the four
 * database groups (client, brand profile, schedule, visual identity) happens once at save.
 */
export interface DraftProfile {
  name: string
  niche: string
  audience: string
  /** What a post should get someone to do. Nothing on a website answers this. */
  goal: string
  tone: string
  language: string
  languageFormality: string
  avoid: string
  pillars: WeightedPillar[]
  /** Palette and brand style travel together — they are one stored object. */
  identity: VisualIdentity
  schedule: DraftSchedule
  /** Empty until the user picks one; nothing is preselected. */
  platform: string
  /** Not a row on the sheet, but it drives compliance downstream, so it must survive the draft. */
  isHealthNiche: boolean
}

/** Where a drafted value came from, shown as the chip beside it. */
export interface FieldProvenance {
  /** Human phrase — "the page title", "a starting cadence". */
  source: string
  /** `low` tints the chip Amber; the value is a guess worth a second look. */
  confidence: 'high' | 'medium' | 'low'
}

/** A drafted profile plus, per field, what produced it. Fields absent from the map were not drafted. */
export interface DraftResult {
  draft: DraftProfile
  provenance: Partial<Record<DraftFieldId, FieldProvenance>>
  /** Fields the site could not answer — the sheet asks about these instead of guessing. */
  unanswered: DraftFieldId[]
}
