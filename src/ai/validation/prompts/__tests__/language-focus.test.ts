import { describe, it, expect, vi } from 'vitest'

// The module imports ai-client transitively, which throws without an API key
// at import time — only the pure merge logic runs here.
vi.mock('@/utils/ai-client')

import { mergeLanguageVerdicts } from '../language-focus'
import type { LanguageIssue } from '@/ai/validation/types'

function issue(original_text: string): LanguageIssue {
  return { type: 'anglicism', original_text, issue_description: 'x', suggested_fix: 'y' }
}

describe('mergeLanguageVerdicts', () => {
  it('no focus pass → judge verdict passes through unchanged', () => {
    const judge = { issues: [issue('лийд')], corrected_text: 'fixed', corrected_slides: null }
    expect(mergeLanguageVerdicts(judge, null)).toEqual({
      issues: [issue('лийд')],
      corrected_text: 'fixed',
      corrected_slides: null,
    })
  })

  it('unions issues, deduped by offending phrase, specialist first', () => {
    const merged = mergeLanguageVerdicts(
      { issues: [issue('лийд'), issue('таргет')], corrected_text: null, corrected_slides: null },
      { issues: [issue('лийд')], corrected_text: null, corrected_slides: null }
    )
    expect(merged.issues.map((i) => i.original_text)).toEqual(['лийд', 'таргет'])
  })

  it("the specialist's corrections win when present; judge's fill the gap otherwise", () => {
    const slides = [{ headline: 'h', body: 'b' }]
    expect(
      mergeLanguageVerdicts(
        { issues: [], corrected_text: 'judge fix', corrected_slides: null },
        { issues: [], corrected_text: 'focus fix', corrected_slides: slides }
      )
    ).toEqual({ issues: [], corrected_text: 'focus fix', corrected_slides: slides })

    expect(
      mergeLanguageVerdicts(
        { issues: [], corrected_text: 'judge fix', corrected_slides: slides },
        { issues: [], corrected_text: null, corrected_slides: null }
      )
    ).toEqual({ issues: [], corrected_text: 'judge fix', corrected_slides: slides })
  })

  // The blind-judge scenario the harness reproduced: merged judge says clean,
  // the specialist catches the transliterated anglicism — its verdict must
  // drive corrections and the refine trigger.
  it('a specialist catch over a clean judge verdict surfaces the issue and the fix', () => {
    const merged = mergeLanguageVerdicts(
      { issues: [], corrected_text: null, corrected_slides: null },
      { issues: [issue('лийд')], corrected_text: 'коригиран текст', corrected_slides: null }
    )
    expect(merged.issues).toHaveLength(1)
    expect(merged.corrected_text).toBe('коригиран текст')
  })
})
