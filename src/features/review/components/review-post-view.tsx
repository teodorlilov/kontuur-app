'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import { useScheduleModal } from '@/components/scheduling/use-schedule-modal'
import { ScheduleModal } from '@/components/scheduling/schedule-modal'
import { PostDetailLayout } from '@/components/posts/post-detail-layout'
import { RewriteButton } from '@/components/posts/rewrite-button'
import { ReviewInfoPanel } from './review-info-panel'
import { parseValidationJson, deriveSlopFromValidation } from '@/lib/review/parse-validation-json'
import {
  REWRITE_SCORE_THRESHOLD,
  AUTHENTICITY_URGENT_THRESHOLD,
} from '@/lib/content-rules/constants'
import type { ReviewPost } from '@/lib/review/filter-review-posts'
import type { CarouselSlide, BestTimePlatform } from '@/types/api'

interface ReviewPostViewProps {
  post: ReviewPost
  bestTimeData: BestTimePlatform[] | null
  onApprove: (postId: string) => void
  onDelete: (postId: string) => void
}

/** Wrapper that owns useReviewActions and renders center + right panels. */
export function ReviewPostView({ post, bestTimeData, onApprove, onDelete }: ReviewPostViewProps) {
  const {
    caption,
    slidesJson,
    validationJson,
    slopResult,
    slopLoading,
    approving,
    rewriting,
    deleting,
    runSlopDetection,
    approve,
    deletePost,
    saveCaption,
    saveSlidesJson,
    rewrite,
  } = useReviewActions({
    postId: post.id,
    clientId: post.client_id,
    initialCaption: post.caption ?? '',
    initialSlidesJson: post.slides_json,
    initialValidationJson: post.validation_json,
    postType: post.post_type,
    rewriteCount: post.rewrite_count ?? 0,
    initialSlop: deriveSlopFromValidation(post.validation_json),
  })

  const scheduleModal = useScheduleModal()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Run slop detection on mount
  useEffect(() => {
    const isCarousel = post.post_type === 'carousel'
    const slides = Array.isArray(slidesJson) ? (slidesJson as CarouselSlide[]) : []
    const textForSlop = isCarousel
      ? `${caption}\n\n${slides.map((s) => `${s.headline}\n${s.body}`).join('\n\n')}`
      : caption
    runSlopDetection(textForSlop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute rewrite visibility
  const qualityData = parseValidationJson(validationJson)
  const hasLowQuality = qualityData ? qualityData.scores.overall_score < REWRITE_SCORE_THRESHOLD : false
  const hasLowAuthenticity = slopResult ? slopResult.human_authenticity_score < AUTHENTICITY_URGENT_THRESHOLD : false
  const hasAiTells = (slopResult?.ai_tells_found.length ?? 0) > 0
  const showRewrite = hasLowAuthenticity || hasAiTells || hasLowQuality

  return (
    <>
      <PostDetailLayout
        caption={caption}
        platform={post.platform}
        postType={post.post_type}
        slidesJson={slidesJson}
        priority={post.priority}
        qualityScoreAvg={post.quality_score_avg}
        pillar={post.pillar}
        sourceUrl={post.source_url}
        sourceTitle={post.source_title}
        sourceType={post.source_type}
        sourceExcerpt={post.source_excerpt}
        editable
        onCaptionChange={(c) => { void saveCaption(c) }}
        onSlidesChange={(s) => { void saveSlidesJson(s) }}
      >
        {showRewrite && (
          <RewriteButton
            hasLowAuthenticity={hasLowAuthenticity}
            hasLowQuality={hasLowQuality}
            regenerating={rewriting}
            onClick={() => { void rewrite() }}
          />
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={() => scheduleModal.openModal()} loading={approving} className="flex-1" size="sm">
            Approve
          </Button>
          <Button onClick={() => { void rewrite() }} loading={rewriting} variant="secondary" size="sm">
            Rewrite
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Delete?</span>
              <Button onClick={() => { void deletePost(() => onDelete(post.id)) }} loading={deleting} variant="danger" size="sm">
                Confirm
              </Button>
              <Button onClick={() => setConfirmDelete(false)} variant="ghost" size="sm">
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setConfirmDelete(true)}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-red-600"
            >
              Delete
            </Button>
          )}
        </div>
      </PostDetailLayout>
      <ReviewInfoPanel
        post={post}
        validationJson={validationJson}
        slopResult={slopResult}
        slopLoading={slopLoading}
      />
      <ScheduleModal
        open={scheduleModal.isOpen}
        onClose={scheduleModal.closeModal}
        onSchedule={(scheduledAt) => {
          scheduleModal.closeModal()
          void approve(() => onApprove(post.id), scheduledAt ?? undefined)
        }}
        bestTimeData={bestTimeData}
        platform={post.platform}
        loading={approving}
        selectedDate={scheduleModal.selectedDate}
        setSelectedDate={scheduleModal.setSelectedDate}
        selectedTime={scheduleModal.selectedTime}
        setSelectedTime={scheduleModal.setSelectedTime}
      />
    </>
  )
}
