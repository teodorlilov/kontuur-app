'use client'

import { Button } from '@/components/ui/button'
import { usePostActions } from '@/components/posts/use-post-actions'
import { useScheduleModal } from '@/components/scheduling/use-schedule-modal'
import { useBestTime } from '@/components/posts/use-best-time'
import { ScheduleModal } from '@/components/scheduling/schedule-modal'
import { PostDetailLayout } from '@/components/posts/post-detail-layout'
import { RewriteButton } from '@/components/posts/rewrite-button'
import { PostVisualsPreview } from './post-visuals-preview'
import {
  REWRITE_SCORE_THRESHOLD,
  AUTHENTICITY_URGENT_THRESHOLD,
} from '@/lib/content-rules/constants'
import type { CarouselSlide } from '@/types/api'
import type { PostData, ValidationData } from '@/types/post'

interface PostDetailProps {
  post: PostData
  validationData: ValidationData
  onApprove: (postId: string) => void
  onDiscard: (postId: string) => void
  onRegenerate: (postId: string, updatedPost: PostData, updatedValidation: ValidationData) => void
}

/** Middle panel: post content with scrollable body and fixed action bar. */
export function PostDetail({ post, validationData, onApprove, onDiscard, onRegenerate }: PostDetailProps) {
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

  const { slop, criteria, scores } = validationData
  const hasLowQuality = scores.overall_score < REWRITE_SCORE_THRESHOLD
  const hasLowAuthenticity = slop.human_authenticity_score < AUTHENTICITY_URGENT_THRESHOLD
  const hasAiTells = slop.ai_tells_found.length > 0
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
        onCaptionChange={setCaption}
        onSlidesChange={(slides) => setSlidesJson(slides)}
      >
        {post.post_type === 'carousel' && (
          <PostVisualsPreview clientId={post.client_id} slides={(slidesJson as CarouselSlide[] | null) ?? []} />
        )}
        {showRewrite && (
          <RewriteButton
            hasLowAuthenticity={hasLowAuthenticity}
            hasLowQuality={hasLowQuality}
            regenerating={regenerating}
            onClick={() => {
              const qualityIssues = criteria.issues.map((i: { type: string; description: string }) => `${i.type}: ${i.description}`)
              const noop = () => {}
              void regenerate(slop.ai_tells_found, qualityIssues, noop, noop)
            }}
          />
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={() => scheduleModal.openModal()} loading={approving} className="flex-1" size="sm">
            Approve
          </Button>
          <Button onClick={() => onDiscard(post.id)} variant="ghost" size="sm" className="text-gray-500 hover:text-red-600">
            Discard
          </Button>
        </div>
      </PostDetailLayout>
      <ScheduleModal
        open={scheduleModal.isOpen}
        onClose={scheduleModal.closeModal}
        onSchedule={(scheduledAt) => {
          scheduleModal.closeModal()
          void approve(scheduledAt ?? undefined)
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
