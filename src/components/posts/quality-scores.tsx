'use client'

import { cn } from '@/utils/cn'
import { scoreBarColor, scoreTextColor } from '@/components/ui/colors/score-colors'

interface BrandCheck {
  passed: boolean
  detail: string | null
}

interface CriteriaDetails {
  openerFollowsRules?: boolean
  openerViolation?: string | null
  structureIsPredictable?: boolean
  formalityConsistent?: boolean
  formalityViolation?: string | null
  sourceFidelityOk?: boolean | null
  healthCompliant?: boolean | null
}

interface QualityScoresProps {
  humanScore: number
  hookScore: number
  ctaScore: number
  criteriaScore?: number
  structureUsed?: string | null
  brandVoiceMatch?: boolean
  brandVoiceDeviation?: string | null
  audienceTargeting?: boolean
  audienceGap?: string | null
  nicheSpecificity?: boolean
  nicheGap?: string | null
  criteriaDetails?: CriteriaDetails
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', scoreBarColor(score))}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className={cn('text-xs font-semibold w-6 text-right', scoreTextColor(score))}>{score}</span>
    </div>
  )
}

function BrandCheckRow({ label, check }: { label: string; check: BrandCheck }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('text-xs w-3', check.passed ? 'text-green-600' : 'text-red-500')}>
        {check.passed ? '✓' : '✗'}
      </span>
      <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
      {!check.passed && check.detail && (
        <span className="text-xs text-gray-400 truncate">{check.detail}</span>
      )}
    </div>
  )
}

export function QualityScores({
  humanScore,
  hookScore,
  ctaScore,
  criteriaScore,
  structureUsed,
  brandVoiceMatch,
  brandVoiceDeviation,
  audienceTargeting,
  audienceGap,
  nicheSpecificity,
  nicheGap,
  criteriaDetails,
}: QualityScoresProps) {
  const brandChecks: Array<{ label: string; check: BrandCheck }> = []
  if (brandVoiceMatch !== undefined) {
    brandChecks.push({ label: 'Brand Voice', check: { passed: brandVoiceMatch, detail: brandVoiceDeviation ?? null } })
  }
  if (audienceTargeting !== undefined) {
    brandChecks.push({ label: 'Audience', check: { passed: audienceTargeting, detail: audienceGap ?? null } })
  }
  if (nicheSpecificity !== undefined) {
    brandChecks.push({ label: 'Niche', check: { passed: nicheSpecificity, detail: nicheGap ?? null } })
  }

  // Build criteria failure list when score is low
  const criteriaFailures: Array<{ label: string; detail: string | null }> = []
  if (criteriaDetails && criteriaScore !== undefined && criteriaScore < 7) {
    if (criteriaDetails.openerFollowsRules === false) {
      criteriaFailures.push({ label: 'Opener', detail: criteriaDetails.openerViolation ?? 'Does not follow rules' })
    }
    if (criteriaDetails.structureIsPredictable === true) {
      criteriaFailures.push({ label: 'Structure', detail: 'Predictable/formulaic structure' })
    }
    if (criteriaDetails.formalityConsistent === false) {
      criteriaFailures.push({ label: 'Formality', detail: criteriaDetails.formalityViolation ?? 'Inconsistent register' })
    }
    if (criteriaDetails.sourceFidelityOk === false) {
      criteriaFailures.push({ label: 'Source', detail: 'Facts not grounded in source' })
    }
    if (criteriaDetails.healthCompliant === false) {
      criteriaFailures.push({ label: 'Health', detail: 'Contains medical claims' })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quality</p>
        {structureUsed && (
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
            {structureUsed}
          </span>
        )}
      </div>
      <ScoreBar label="Human" score={humanScore} />
      <ScoreBar label="Hook" score={hookScore} />
      <ScoreBar label="CTA" score={ctaScore} />
      {criteriaScore !== undefined && <ScoreBar label="Criteria" score={criteriaScore} />}
      {brandChecks.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-gray-100">
          {brandChecks.map((bc) => (
            <BrandCheckRow key={bc.label} label={bc.label} check={bc.check} />
          ))}
        </div>
      )}
      {criteriaFailures.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-gray-100">
          {criteriaFailures.map((cf) => (
            <BrandCheckRow key={cf.label} label={cf.label} check={{ passed: false, detail: cf.detail }} />
          ))}
        </div>
      )}
    </div>
  )
}
