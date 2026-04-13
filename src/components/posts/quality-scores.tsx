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

function CriterionRow({
  passes,
  label,
  gap,
}: {
  passes: boolean
  label: string
  gap?: string | null
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn('text-xs w-3 shrink-0 mt-0.5', passes ? 'text-green-600' : 'text-red-500')}>
        {passes ? '✓' : '✗'}
      </span>
      <span className="text-xs text-gray-600 shrink-0">{label}</span>
      {!passes && gap && (
        <span className="text-xs text-gray-400 truncate ml-1">{gap}</span>
      )}
    </div>
  )
}

function Section({
  title,
  score,
  children,
}: {
  title: string
  score: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ScoreBar label={title} score={score} />
      <div className="flex flex-col gap-1 pl-4">{children}</div>
    </div>
  )
}

export function QualityScores({ criteria, scores }: QualityScoresProps) {
  const hookVerdict = criteria.hook.verdict
  const ctaVerdict = criteria.cta.verdict

  const verdictLabel = (v: string) =>
    v.replace(/_/g, ' ')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quality</p>

      {/* Brief Adherence */}
      <Section title="Brief" score={scores.brief_score}>
        <CriterionRow passes={criteria.niche_fit.passes} label="Niche fit" gap={criteria.niche_fit.gap} />
        <CriterionRow passes={criteria.audience_match.passes} label="Audience" gap={criteria.audience_match.gap} />
        {criteria.pillar_match !== null && (
          <CriterionRow passes={criteria.pillar_match.passes} label="Pillar" gap={criteria.pillar_match.gap} />
        )}
        <CriterionRow passes={criteria.theme_adherence.passes} label="Theme" gap={criteria.theme_adherence.gap} />
      </Section>

      {/* Execution */}
      <Section title="Craft" score={scores.craft_score}>
        <CriterionRow
          passes={['stops_scroll', 'clear_value'].includes(hookVerdict)}
          label={`Hook (${verdictLabel(hookVerdict)})`}
          gap={criteria.hook.note}
        />
        <CriterionRow
          passes={['natural_specific', 'clear_relevant'].includes(ctaVerdict)}
          label={`CTA (${verdictLabel(ctaVerdict)})`}
          gap={criteria.cta.note}
        />
        {criteria.structure_followed !== null && (
          <div className="flex flex-col gap-1">
            <CriterionRow
              passes={criteria.structure_followed.passes}
              label="Structure"
            />
            <div className="flex flex-col gap-0.5 pl-3">
              {criteria.structure_followed.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className={cn('text-[10px] shrink-0 mt-0.5', check.passes ? 'text-green-500' : 'text-red-400')}>
                    {check.passes ? '✓' : '✗'}
                  </span>
                  <span className="text-[10px] text-gray-500 leading-relaxed">
                    {check.passes ? check.rule : check.note ?? check.rule}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <CriterionRow
          passes={criteria.ai_tells.length < 2}
          label="Authenticity"
          gap={criteria.ai_tells.length > 0 ? (criteria.ai_tells[0] ?? null) : null}
        />
      </Section>

      {/* Brand & Voice */}
      <Section title="Voice" score={scores.voice_score}>
        <CriterionRow passes={criteria.brand_voice.passes} label="Brand voice" gap={criteria.brand_voice.gap} />
        <CriterionRow passes={criteria.formality.passes} label="Formality" gap={criteria.formality.gap} />
      </Section>

      {/* Language */}
      <div className="flex flex-col gap-1.5">
        <ScoreBar label="Language" score={scores.language_score} />
        <div className="flex flex-col gap-1 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 shrink-0">Naturalness</span>
            <span className={cn('text-xs font-semibold', scoreTextColor(scores.language_naturalness_score))}>
              {scores.language_naturalness_score}/10
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 shrink-0">Register</span>
            <span className={cn('text-xs font-semibold', scoreTextColor(scores.language_register_score))}>
              {scores.language_register_score}/10
            </span>
          </div>
        </div>
      </div>

      {/* Source grounding score (when present) */}
      {scores.source_score !== null && (
        <ScoreBar label="Source" score={scores.source_score} />
      )}
    </div>
  )
}
