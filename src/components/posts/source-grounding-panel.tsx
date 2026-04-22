'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { scoreBadgeClass } from '@/components/ui/colors/score-colors'
import type { SourceGroundingResult } from '@/types/api'

interface SourceGroundingPanelProps {
  result: SourceGroundingResult
  sourceUrl?: string | null
  sourceTitle?: string | null
  onApplyFixes?: (
    correctedText: string,
    correctedSlides?: Array<{ headline: string; body: string }> | null
  ) => void
}

const statusColors: Record<string, string> = {
  grounded: 'bg-green-100 text-green-700',
  ungrounded: 'bg-red-100 text-red-700',
  partially_grounded: 'bg-amber-100 text-amber-700',
}

const statusLabels: Record<string, string> = {
  grounded: 'Grounded',
  ungrounded: 'Ungrounded',
  partially_grounded: 'Partial',
}

export function SourceGroundingPanel({
  result,
  sourceUrl,
  sourceTitle,
  onApplyFixes,
}: SourceGroundingPanelProps) {
  const [expanded, setExpanded] = useState(!result.grounded)
  const ungroundedCount = result.flagged_claims.filter((c) => c.status !== 'grounded').length

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-left"
      >
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Source Grounding
        </p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              scoreBadgeClass(result.grounding_score)
            )}
          >
            {result.grounding_score}/10
          </span>
          {result.grounded ? (
            <span className="text-xs text-green-600">✓ Verified</span>
          ) : (
            <span className="text-xs text-red-600">
              {ungroundedCount} ungrounded claim{ungroundedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3">
          {result.flagged_claims.map((claim, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    statusColors[claim.status] ?? 'bg-gray-100 text-gray-700'
                  )}
                >
                  {statusLabels[claim.status] ?? claim.status}
                </span>
                <span className="text-xs text-gray-600 italic">"{claim.claim}"</span>
              </div>
              {claim.source_evidence && (
                <p className="text-xs text-gray-500">Evidence: {claim.source_evidence}</p>
              )}
            </div>
          ))}

          {onApplyFixes && result.corrected_text && (
            <button
              onClick={() => onApplyFixes(result.corrected_text!, result.corrected_slides)}
              className="text-xs font-medium text-[var(--color-terracotta)] hover:underline text-left"
            >
              Fix ungrounded claims
            </button>
          )}

          {(sourceUrl || sourceTitle) && (
            <div className="flex items-center gap-1 pt-1">
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--color-terracotta)] hover:underline"
                >
                  {sourceTitle ?? 'View source'}
                </a>
              ) : (
                <span className="text-xs text-gray-500">Source: {sourceTitle}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
