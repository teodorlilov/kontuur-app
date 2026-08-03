import type { DraftFieldId } from '@/features/onboarding/types'

/**
 * Where each row sits on the draft sheet.
 *
 * Two columns plus a full-width band, split by kind rather than by sequence: the left column is
 * who the client is (all text), the right is what they publish (data and controls), and the band
 * holds the one row carrying imagery. That split is what balances the sheet — with the visual
 * system inside "Content and look" the right column ran half again as tall as the left, and no
 * reassignment of whole groups fixes both the drafted and the blank-form cases at once.
 */
export type DraftColumn = 'left' | 'right' | 'band'

export interface DraftGroup {
  id: string
  name: string
  column: DraftColumn
}

export const DRAFT_GROUPS: readonly DraftGroup[] = [
  { id: 'basics', name: 'The basics', column: 'left' },
  { id: 'people', name: 'Their people', column: 'left' },
  { id: 'voice', name: 'How they sound', column: 'left' },
  { id: 'look', name: 'Content and look', column: 'right' },
  { id: 'publishing', name: 'Publishing', column: 'right' },
  { id: 'system', name: 'Their visual system', column: 'band' },
] as const

/** How a row renders. Anything past `longText` owns its own read view and editor. */
export type DraftRowKind =
  | 'text'
  | 'longText'
  | 'choice'
  | 'language'
  | 'mix'
  | 'palette'
  | 'style'
  | 'schedule'
  | 'platform'

export interface DraftRowSpec {
  id: DraftFieldId
  group: string
  label: string
  kind: DraftRowKind
  /** Placeholder for the blank form. Absent where the control speaks for itself. */
  placeholder?: string
  /** Fixed options for a `choice` row. */
  options?: readonly string[]
  /** Shown on the amber band when nothing could answer this from the site. */
  question?: string
}

/**
 * Every field on the sheet, in reading order within its group.
 *
 * `goal` is the only row with no `detected_*` source: nothing on a website states what a post
 * should make someone do, so it is always the user's call rather than a guess dressed as a draft.
 */
export const DRAFT_ROWS: readonly DraftRowSpec[] = [
  { id: 'name', group: 'basics', label: 'Client name', kind: 'text', placeholder: 'Acme Studio' },
  {
    id: 'niche',
    group: 'basics',
    label: 'What they do',
    kind: 'text',
    placeholder: 'What do they sell or do?',
  },

  {
    id: 'audience',
    group: 'people',
    label: 'Audience',
    kind: 'text',
    placeholder: 'Who are they trying to reach?',
  },
  {
    id: 'goal',
    group: 'people',
    label: 'Post goal',
    kind: 'choice',
    question: 'The site never says what a post should get someone to do.',
    options: ['Book a viewing', 'Send an enquiry', 'Follow and engage', 'Build trust'],
  },

  {
    id: 'tone',
    group: 'voice',
    label: 'Tone',
    kind: 'longText',
    placeholder: 'How should their posts sound?',
  },
  { id: 'language', group: 'voice', label: 'Language', kind: 'language' },
  {
    id: 'avoid',
    group: 'voice',
    label: 'Never post',
    kind: 'longText',
    placeholder: 'Anything they must never post about',
  },

  { id: 'mix', group: 'look', label: 'Content mix', kind: 'mix' },
  { id: 'palette', group: 'look', label: 'Brand palette', kind: 'palette' },

  { id: 'schedule', group: 'publishing', label: 'Schedule', kind: 'schedule' },
  {
    id: 'platform',
    group: 'publishing',
    label: 'Platform',
    kind: 'platform',
    question: 'Nothing on the site says where these posts should go.',
  },

  { id: 'style', group: 'system', label: 'Visual system', kind: 'style' },
] as const

/** The rows belonging to a group, in declaration order. */
export function rowsForGroup(groupId: string): DraftRowSpec[] {
  return DRAFT_ROWS.filter((row) => row.group === groupId)
}

/** Every field id on the sheet, in reading order — the order the sheet asks about them. */
export const DRAFT_FIELD_ORDER: readonly DraftFieldId[] = DRAFT_GROUPS.flatMap((group) =>
  rowsForGroup(group.id).map((row) => row.id)
)

/** The groups rendered into a given region of the sheet. */
export function groupsForColumn(column: DraftColumn): DraftGroup[] {
  return DRAFT_GROUPS.filter((group) => group.column === column)
}
