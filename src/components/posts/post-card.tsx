'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { usePostActions } from '@/components/posts/use-post-actions'
import { useScheduleModal } from '@/components/scheduling/use-schedule-modal'
import { useBestTime } from '@/components/posts/use-best-time'
import { ScheduleModal } from '@/components/scheduling/schedule-modal'
import { PostContentDisplay } from './post-content-display'
import { SlopDetector } from './slop-detector'
import { LanguagePanel } from './language-panel'
import type { CarouselSlide, LanguageResult } from '@/types/api'
import { SourceGroundingPanel } from './source-grounding-panel'
import { REWRITE_SCORE_THRESHOLD, AUTHENTICITY_URGENT_THRESHOLD } from '@/lib/content-rules/constants'
import type {
  SlopDetection,
  SingleQualityResult,
  CarouselQualityResult,
  QualityResult,
  SourceGroundingResult,
} from '@/types/api'

export type { SingleQualityResult, CarouselQualityResult }

export interface ValidationData {
  quality: QualityResult
  language: LanguageResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
}

export interface PostData {
  id: string
  client_id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: unknown
  carousel_quality_json: unknown
  status: string
  priority: boolean
  quality_score_avg: number | null
  topic_summary?: string | null
  was_rewritten?: boolean
  rewrite_count?: number
  source_url?: string | null
  source_title?: string | null
  source_type?: string | null
  pillar?: string | null
  source_excerpt?: string | null
  created_at: string
}

interface PostCardProps {
  post: PostData
  validationData: ValidationData
  theme?: string
  onApprove: (postId: string) => void
  onDiscard: (postId: string) => void
  onRegenerate?: (postId: string, updatedPost: PostData, updatedValidation: ValidationData) => void
}

export function PostCard({ post, validationData, theme, onApprove, onDiscard, onRegenerate }: PostCardProps) {
  const {
    caption,
    setCaption,
    slidesJson,
    setSlidesJson,
    approving,
    regenerating,
    approve,
    regenerate,
  } = usePostActions({ post, onApprove, onRegenerate })

  const scheduleModal = useScheduleModal()
  const { bestTimeData } = useBestTime(post.client_id)
  const [discarding, setDiscarding] = useState(false)
  const [languageData, setLanguageData] = useState(validationData.language)
  const [sourceGroundingData, setSourceGroundingData] = useState(validationData.sourceGrounding)

  const { quality, slop } = validationData

  function handleApplyFixes(correctedText: string, correctedSlides?: Array<{ headline: string; body: string }> | null) {
    if (correctedText) setCaption(correctedText)
    if (correctedSlides && Array.isArray(slidesJson)) {
      const merged = (slidesJson as CarouselSlide[]).map((existing, i) => {
        const fix = correctedSlides[i]
        return fix ? { ...existing, headline: fix.headline, body: fix.body } : existing
      })
      setSlidesJson(merged)
    }
    setLanguageData({ passes: true, language_score: 10, issues: [], corrected_text: null, corrected_slides: null })
    toast.success('Language fixes applied')
  }

  function handleApplySourceGroundingFixes(correctedText: string, correctedSlides?: Array<{ headline: string; body: string }> | null) {
    if (correctedText) setCaption(correctedText)
    if (correctedSlides && Array.isArray(slidesJson)) {
      const merged = (slidesJson as CarouselSlide[]).map((existing, i) => {
        const fix = correctedSlides[i]
        return fix ? { ...existing, headline: fix.headline, body: fix.body } : existing
      })
      setSlidesJson(merged)
    }
    setSourceGroundingData({ grounded: true, grounding_score: 10, flagged_claims: [], corrected_text: null, corrected_slides: null })
    toast.success('Ungrounded claims fixed')
  }

  function handleApproveClick() {
    scheduleModal.openModal()
  }

  async function handleScheduleDecision(scheduledAt: string | null) {
    scheduleModal.closeModal()
    await approve(scheduledAt ?? undefined)
  }

  function handleDiscard() {
    onDiscard(post.id)
  }

  async function handleRegenerate() {
    const qualityIssues = quality.issues.map((i) => `${i.type}: ${i.description}`)
    await regenerate(slop.ai_tells_found, qualityIssues, setLanguageData, setSourceGroundingData)
  }

  const avgScore = quality.quality_score_avg
  const hasLowAuthenticity = slop.human_authenticity_score < AUTHENTICITY_URGENT_THRESHOLD
  const hasAiTells = slop.ai_tells_found.length > 0
  const hasLowQuality = avgScore < REWRITE_SCORE_THRESHOLD
  const showRewrite = hasLowAuthenticity || hasAiTells || hasLowQuality

  const qualityScores = {
    human_score: quality.human_score,
    hook_score: quality.hook_score,
    cta_score: quality.cta_score,
    criteria_score: quality.criteria_score,
    structure_used: quality.structure_used,
    brand_voice_match: quality.brand_voice_match,
    brand_voice_deviation: quality.brand_voice_deviation,
    audience_targeting: quality.audience_targeting,
    audience_gap: quality.audience_gap,
    niche_specificity: quality.niche_specificity,
    niche_gap: quality.niche_gap,
    structure_is_predictable: quality.structure_is_predictable,
    formality_consistent: quality.formality_consistent,
    formality_violation: quality.formality_violation,
    source_fidelity_ok: quality.source_fidelity_ok,
    health_compliant: quality.health_compliant,
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-5 flex flex-col gap-5">
        <PostContentDisplay
          caption={caption}
          platform={post.platform}
          postType={post.post_type}
          slidesJson={slidesJson}
          priority={post.priority}
          qualityScoreAvg={post.quality_score_avg}
          sourceUrl={post.source_url}
          sourceTitle={post.source_title}
          sourceType={post.source_type}
          sourceExcerpt={post.source_excerpt}
          pillar={post.pillar}
          theme={theme}
          qualityScores={qualityScores}
        />

        {/* Slop detector */}
        <SlopDetector result={slop} />

        {/* Regenerate button — shown when quality/authenticity issues detected */}
        {showRewrite && (
          <Button
            onClick={() => { void handleRegenerate() }}
            loading={regenerating}
            variant="secondary"
            size="sm"
            className={cn(
              hasLowAuthenticity
                ? 'text-red-600 border-red-200 hover:bg-red-50'
                : hasLowQuality
                  ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            {regenerating
              ? 'Rewriting...'
              : hasLowAuthenticity
                ? 'Rewrite — reads as AI'
                : hasLowQuality
                  ? 'Rewrite — low quality'
                  : 'Rewrite to improve'}
          </Button>
        )}

        {/* Language panel */}
        <LanguagePanel
          result={languageData}
          onApplyFixes={handleApplyFixes}
          autoApplied={(languageData.issues?.length ?? 0) > 0 && !!(languageData.corrected_text || languageData.corrected_slides)}
        />

        {/* Source grounding panel */}
        {sourceGroundingData && (
          <SourceGroundingPanel
            result={sourceGroundingData}
            sourceUrl={post.source_url}
            sourceTitle={post.source_title}
            onApplyFixes={handleApplySourceGroundingFixes}
          />
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <Button
            onClick={handleApproveClick}
            loading={approving}
            className="flex-1"
            size="sm"
          >
            Approve
          </Button>
          <Button
            onClick={() => { void handleDiscard() }}
            loading={discarding}
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-red-600"
          >
            Discard
          </Button>
        </div>
      </div>

      <ScheduleModal
        open={scheduleModal.isOpen}
        onClose={scheduleModal.closeModal}
        onSchedule={(scheduledAt) => { void handleScheduleDecision(scheduledAt) }}
        bestTimeData={bestTimeData}
        platform={post.platform}
        loading={approving}
        selectedDate={scheduleModal.selectedDate}
        setSelectedDate={scheduleModal.setSelectedDate}
        selectedTime={scheduleModal.selectedTime}
        setSelectedTime={scheduleModal.setSelectedTime}
      />
    </div>
  )
}
