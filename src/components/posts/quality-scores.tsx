'use client'

import { cn } from '@/utils/cn'
import { scoreBarColor, scoreTextColor } from '@/components/ui/colors/score-colors'
import type { ValidationCriteria, ValidationScores } from '@/types/api'

interface QualityScoresProps {
  criteria: ValidationCriteria
  scores: ValidationScores
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', scoreBarColor(score))}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className={cn('text-xs font-semibold w-6 text-right', scoreTextColor(score))}>
        {score}
      </span>
    </div>
  )
}

/** Lean quality panel: score bars + failing issues only — a clean post shows just scores. */
export function QualityScores({ criteria, scores }: QualityScoresProps) {
  const structureFailed = criteria.structure_followed !== null && !criteria.structure_followed.passes

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <ScoreBar label="Human" score={scores.human_score} />
        <ScoreBar label="Language" score={scores.language_score} />
        {scores.source_score !== null && <ScoreBar label="Sources" score={scores.source_score} />}
      </div>

      {criteria.issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-gray-600">Issues to fix</p>
          {criteria.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs text-red-500 shrink-0 mt-0.5">✗</span>
              <span className="text-xs text-gray-600">
                <span className="font-medium">{issue.type.replaceAll('_', ' ')}:</span>{' '}
                {issue.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {structureFailed && criteria.structure_followed && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-gray-600">Carousel structure</p>
          {criteria.structure_followed.notes.map((note, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs text-red-500 shrink-0 mt-0.5">✗</span>
              <span className="text-xs text-gray-600">{note}</span>
            </div>
          ))}
        </div>
      )}

      {criteria.ai_tells.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-gray-600">Sounds like AI</p>
          {criteria.ai_tells.map((tell, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs text-amber-500 shrink-0 mt-0.5">⚠</span>
              <span className="text-xs text-gray-600">{tell}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
