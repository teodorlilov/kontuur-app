'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CanvasEditor } from '@/features/canvas-editor/components/canvas-editor'
import { slideCopyAt } from '@/features/canvas-editor/lib/slide-copy'
import { nudgeStaleBakedText } from '@/features/canvas-editor/lib/stale-text-nudge'
import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import { useScheduleModal } from '@/components/scheduling/use-schedule-modal'
import { ScheduleModal } from '@/components/scheduling/schedule-modal'
import { PostDetailLayout } from '@/components/posts/post-detail-layout'
import { RewriteButton } from '@/components/posts/rewrite-button'
import { parseSlides } from '@/components/posts/parse-slides'
import { useGenerateVisuals } from '@/features/publishing/hooks/use-generate-visuals'
import { missingImagePositions } from '@/features/publishing/lib/image-list'
import { ReviewInfoPanel } from './review-info-panel'
import { parseValidationJson, deriveSlopFromValidation } from '@/features/review/lib/parse-validation-json'
import {
  REWRITE_SCORE_THRESHOLD,
  AUTHENTICITY_URGENT_THRESHOLD,
} from '@/lib/content-rules/constants'
import type { ReviewPost } from '@/features/review/lib/filter-review-posts'
import type { BestTimePlatform, PostImage } from '@/types/api'

interface ReviewPostViewProps {
  post: ReviewPost
  bestTimeData: BestTimePlatform[] | null
  onApprove: (postId: string) => void
  onDelete: (postId: string) => void
  onImageUpserted: (postId: string, image: PostImage) => void
  onImageDeleted: (postId: string, imageId: string) => void
}

/** Wrapper that owns useReviewActions and renders center + right panels. */
export function ReviewPostView({ post, bestTimeData, onApprove, onDelete, onImageUpserted, onImageDeleted }: ReviewPostViewProps) {
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
  const [editingPosition, setEditingPosition] = useState<number | null>(null)

  const images = post.images
  const mergeImage = useCallback(
    (image: PostImage) => onImageUpserted(post.id, image),
    [onImageUpserted, post.id]
  )

  const slides = parseSlides(slidesJson)
  const isCarousel = post.post_type === 'carousel'
  const getSlideCopy = useCallback(
    (position: number) =>
      slideCopyAt({ post_type: post.post_type, slides_json: slidesJson, caption }, position),
    [post.post_type, slidesJson, caption]
  )
  const { generatingPositions, composingPositions, generate } = useGenerateVisuals(post.id, mergeImage, getSlideCopy)

  const totalSlots = isCarousel ? slides.length : 1
  const missingPositions = missingImagePositions(images, totalSlots, generatingPositions)
  const slotsWithoutImage = totalSlots - images.length
  const editingImage = editingPosition !== null ? images.find((img) => img.position === editingPosition) : undefined

  // Rewrites never regenerate visuals — but baked text can go stale; nudge instead (v1 policy).
  const handleRewrite = useCallback(async () => {
    await rewrite()
    nudgeStaleBakedText(images.length)
  }, [rewrite, images.length])

  // Run slop detection on mount
  useEffect(() => {
    const isCarousel = post.post_type === 'carousel'
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
        postId={post.id}
        images={images}
        onImageUploaded={mergeImage}
        onImageDeleted={(imageId) => onImageDeleted(post.id, imageId)}
        onGenerateImage={(position) => { void generate([position]) }}
        generatingPositions={generatingPositions}
        composingPositions={composingPositions}
        onEditImage={setEditingPosition}
      >
        {showRewrite && (
          <RewriteButton
            hasLowAuthenticity={hasLowAuthenticity}
            hasLowQuality={hasLowQuality}
            regenerating={rewriting}
            onClick={() => { void handleRewrite() }}
          />
        )}
        {slotsWithoutImage > 0 && (
          <Button
            onClick={() => { void generate(missingPositions) }}
            loading={generatingPositions.length > 0}
            variant="secondary"
            size="sm"
          >
            <Sparkles style={{ width: 13, height: 13, marginRight: 5 }} />
            Generate visuals ({slotsWithoutImage})
          </Button>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={() => scheduleModal.openModal()} loading={approving} className="flex-1" size="sm">
            Approve
          </Button>
          <Button onClick={() => { void handleRewrite() }} loading={rewriting} variant="secondary" size="sm">
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
      {editingPosition !== null && editingImage && (
        <CanvasEditor
          target={{ kind: 'post', postId: post.id, position: editingPosition }}
          image={{ publicUrl: editingImage.publicUrl, storagePath: editingImage.storagePath }}
          slideCopy={getSlideCopy(editingPosition)}
          slideLabel={isCarousel ? `Slide ${editingPosition + 1} of ${totalSlots}` : 'Post visual'}
          onClose={() => setEditingPosition(null)}
          onSaved={mergeImage}
        />
      )}
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
