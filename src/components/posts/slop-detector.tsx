'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { scoreBadgeClass } from '@/components/ui/colors/score-colors'
import type { SlopDetection } from '@/types/api'

interface SlopDetectorProps {
  result: SlopDetection
}

export function SlopDetector({ result }: SlopDetectorProps) {
  const [expanded, setExpanded] = useState(false)
  const { human_authenticity_score, ai_tells_found, worst_offending_phrase } = result

  const badgeClass = scoreBadgeClass(human_authenticity_score)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Authenticity</p>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', badgeClass)}>
          {human_authenticity_score}/10
        </span>
      </div>

      {human_authenticity_score < 4 && (
        <p className="text-xs text-red-600">Reads as AI — rewrite recommended</p>
      )}
      {human_authenticity_score >= 4 && human_authenticity_score < 6 && (
        <p className="text-xs text-amber-600">May read as AI-generated</p>
      )}
      {human_authenticity_score >= 6 && human_authenticity_score < 8 && ai_tells_found.length > 0 && (
        <p className="text-xs text-gray-500">
          {ai_tells_found.length} AI pattern{ai_tells_found.length !== 1 ? 's' : ''} detected
        </p>
      )}

      {ai_tells_found.length > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-gray-400 hover:text-gray-600 text-left"
        >
          {expanded ? 'Hide' : `Show ${ai_tells_found.length} AI tell${ai_tells_found.length !== 1 ? 's' : ''}`}
        </button>
      )}

      {expanded && (
        <div className="flex flex-col gap-1">
          {ai_tells_found.map((tell, i) => (
            <p key={i} className="text-xs text-gray-600">
              · {tell}
            </p>
          ))}
          {worst_offending_phrase && (
            <p className="text-xs text-red-500 italic mt-1">
              Worst: "{worst_offending_phrase}"
            </p>
          )}
        </div>
      )}
    </div>
  )
}
