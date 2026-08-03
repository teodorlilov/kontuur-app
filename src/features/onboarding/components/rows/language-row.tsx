'use client'

import { Select, ensureOption } from '@/components/ui/select'
import { CONTENT_LANGUAGE_OPTIONS, LANGUAGE_FORMALITY_OPTIONS } from '@/utils/constants'
import type { DraftProfile } from '@/features/onboarding/types'

type LanguageDraft = Pick<DraftProfile, 'language' | 'languageFormality'>

/** "Bulgarian — Formal", using the same labels the pickers show. */
export function formatLanguage(draft: LanguageDraft): string {
  if (!draft.language) return ''
  const formality = LANGUAGE_FORMALITY_OPTIONS.find(
    (option) => option.value === draft.languageFormality
  )?.label
  return formality ? `${draft.language} — ${formality}` : draft.language
}

export function LanguageRead({ draft }: { draft: LanguageDraft }) {
  return <span className="truncate text-ink">{formatLanguage(draft) || '—'}</span>
}

/**
 * Two pickers, matching the client settings Language panel.
 *
 * One row, two stored fields — `clients.language` and `brand_profiles.language_formality`. A
 * single text input could only ever edit one of them: the row read "Bulgarian — formal" but typing
 * in it set the language and left the formality wherever the site read had put it, with no way to
 * correct a wrong guess until after the client was saved. Two selects make both editable and, by
 * reading `CONTENT_LANGUAGE_OPTIONS` and `LANGUAGE_FORMALITY_OPTIONS`, guarantee onboarding can
 * only produce values settings can also show.
 */
export function LanguageEdit({
  draft,
  onChange,
}: {
  draft: LanguageDraft
  onChange: (patch: Partial<DraftProfile>) => void
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <Select
        label="Language"
        value={draft.language}
        onChange={(event) => onChange({ language: event.target.value })}
        // A site read can name a language the list has never carried; it stays selectable.
        options={ensureOption(CONTENT_LANGUAGE_OPTIONS, draft.language)}
        placeholder={draft.language ? undefined : 'Pick a language'}
      />
      <Select
        label="Formality"
        value={draft.languageFormality}
        onChange={(event) => onChange({ languageFormality: event.target.value })}
        options={ensureOption(LANGUAGE_FORMALITY_OPTIONS, draft.languageFormality)}
      />
    </div>
  )
}
