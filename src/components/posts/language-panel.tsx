'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { scoreBadgeClass } from '@/components/ui/colors/score-colors'
import type { LanguageIssueType, LanguageResult } from '@/types/api'

interface LanguagePanelProps {
  result: LanguageResult
  onApplyFixes: (
    correctedText: string,
    correctedSlides?: Array<{ headline: string; body: string }> | null
  ) => void
  /** When true, corrections were already applied server-side — panel is informational */
  autoApplied?: boolean
}

const typeLabels: Record<LanguageIssueType, string> = {
  anglicism: 'Anglicism',
  calque: 'Calque',
  grammar: 'Grammar',
  formality: 'Formality',
  register: 'Register',
  mixed_script: 'Mixed Script',
  vocabulary: 'Vocabulary',
  instructions: 'Protocol',
}

const typeColors: Record<LanguageIssueType, string> = {
  anglicism: 'bg-red-100 text-red-700',
  calque: 'bg-orange-100 text-orange-700',
  grammar: 'bg-amber-100 text-amber-700',
  formality: 'bg-purple-100 text-purple-700',
  register: 'bg-blue-100 text-blue-700',
  mixed_script: 'bg-rose-100 text-rose-700',
  vocabulary: 'bg-teal-100 text-teal-700',
  instructions: 'bg-indigo-100 text-indigo-700',
}

export function LanguagePanel({ result, onApplyFixes, autoApplied = false }: LanguagePanelProps) {
  const [expanded, setExpanded] = useState(!result.passes && !autoApplied)
  const { passes, language_score, issues, corrected_text, corrected_slides } = result

  const showAutoAppliedBadge = autoApplied && issues.length > 0

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-left"
      >
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Language</p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              scoreBadgeClass(language_score)
            )}
          >
            {language_score}/10
          </span>
          {showAutoAppliedBadge ? (
            <span className="text-xs text-blue-600">{issues.length} auto-corrected</span>
          ) : passes ? (
            <span className="text-xs text-green-600">✓ Pass</span>
          ) : (
            <span className="text-xs text-red-600">
              {issues.length} issue{issues.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {expanded && issues.length > 0 && (
        <div className="flex flex-col gap-3">
          {showAutoAppliedBadge && (
            <p className="text-xs text-blue-600">
              These issues were automatically corrected in the text above.
            </p>
          )}
          {issues.map((issue, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    typeColors[issue.type]
                  )}
                >
                  {typeLabels[issue.type]}
                </span>
                <span className="text-xs text-gray-500 italic">"{issue.original_text}"</span>
              </div>
              <p className="text-xs text-gray-600">{issue.issue_description}</p>
              <p className="text-xs text-green-700">→ {issue.suggested_fix}</p>
            </div>
          ))}

          {!autoApplied && (corrected_text || corrected_slides) && (
            <button
              onClick={() => onApplyFixes(corrected_text ?? '', corrected_slides)}
              className="text-xs font-medium text-brand-purple hover:underline text-left"
            >
              Apply all fixes
            </button>
          )}
        </div>
      )}
    </div>
  )
}
