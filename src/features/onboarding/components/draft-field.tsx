'use client'

import { Chip, ChipGroup } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StyleOptions } from '@/features/visual-identity/components/style-options'
import type { DraftRowSpec } from '@/features/onboarding/lib/draft-rows'
import type { DraftProfile } from '@/features/onboarding/types'
import type { ExtractionStatus } from '@/features/visual-identity/hooks/use-extraction-status'
import { LanguageEdit, LanguageRead } from './rows/language-row'
import { MixEdit, MixRead } from './rows/mix-row'
import { PaletteEdit, PaletteRead } from './rows/palette-row'
import { PlatformEdit, PlatformRead } from './rows/platform-row'
import { ScheduleEdit, ScheduleRead } from './rows/schedule-row'

interface DraftFieldProps {
  spec: DraftRowSpec
  draft: DraftProfile
  onChange: (patch: Partial<DraftProfile>) => void
  /** How the async brand-colour read is going. Only the palette row cares. */
  paletteStatus?: ExtractionStatus
}

/**
 * The read view of one field.
 *
 * Kept beside the editor rather than in the sheet so that adding a field means touching one file,
 * and so a row's two views cannot describe different things.
 */
export function DraftFieldRead({ spec, draft, paletteStatus }: Omit<DraftFieldProps, 'onChange'>) {
  switch (spec.kind) {
    case 'mix':
      return <MixRead pillars={draft.pillars} />
    case 'palette':
      return <PaletteRead palette={draft.identity.palette} status={paletteStatus} />
    case 'schedule':
      return <ScheduleRead schedule={draft.schedule} />
    case 'platform':
      return <PlatformRead platform={draft.platform} />
    case 'language':
      return <LanguageRead draft={draft} />
    case 'style':
      // A picker with one option chosen is already its own read view.
      return null
    default: {
      const value = readText(spec, draft)
      return <span className="truncate text-ink">{value || '—'}</span>
    }
  }
}

/** The editor for one field. */
export function DraftFieldEdit({ spec, draft, onChange, paletteStatus }: DraftFieldProps) {
  switch (spec.kind) {
    case 'mix':
      return <MixEdit pillars={draft.pillars} onChange={(pillars) => onChange({ pillars })} />
    case 'palette':
      return (
        <PaletteEdit
          palette={draft.identity.palette}
          status={paletteStatus}
          onChange={(palette) => onChange({ identity: { ...draft.identity, palette } })}
        />
      )
    case 'schedule':
      return (
        <ScheduleEdit schedule={draft.schedule} onChange={(schedule) => onChange({ schedule })} />
      )
    case 'platform':
      return (
        <PlatformEdit platform={draft.platform} onChange={(platform) => onChange({ platform })} />
      )
    case 'style':
      return (
        <StyleOptions
          value={draft.identity.style}
          onChange={(style) => onChange({ identity: { ...draft.identity, style } })}
        />
      )
    case 'language':
      return <LanguageEdit draft={draft} onChange={onChange} />
    case 'choice':
      return (
        <ChipGroup label={spec.label}>
          {(spec.options ?? []).map((option) => (
            <Chip
              key={option}
              pressed={draft.goal === option}
              onClick={() => onChange({ goal: option })}
            >
              {option}
            </Chip>
          ))}
        </ChipGroup>
      )
    case 'longText':
      return (
        <Textarea
          rows={3}
          value={readText(spec, draft)}
          placeholder={spec.placeholder}
          aria-label={spec.label}
          onChange={(event) => onChange(writeText(spec, event.target.value))}
        />
      )
    default:
      return (
        <Input
          value={readText(spec, draft)}
          placeholder={spec.placeholder}
          aria-label={spec.label}
          onChange={(event) => onChange(writeText(spec, event.target.value))}
        />
      )
  }
}

/** The plain-text fields, read out of the draft. */
function readText(spec: DraftRowSpec, draft: DraftProfile): string {
  switch (spec.id) {
    case 'name':
      return draft.name
    case 'niche':
      return draft.niche
    case 'audience':
      return draft.audience
    case 'goal':
      return draft.goal
    case 'tone':
      return draft.tone
    case 'avoid':
      return draft.avoid
    default:
      return ''
  }
}

/** The inverse, for the fields a user types into. */
function writeText(spec: DraftRowSpec, value: string): Partial<DraftProfile> {
  switch (spec.id) {
    case 'name':
      return { name: value }
    case 'niche':
      return { niche: value }
    case 'audience':
      return { audience: value }
    case 'goal':
      return { goal: value }
    case 'tone':
      return { tone: value }
    case 'avoid':
      return { avoid: value }
    default:
      return {}
  }
}
