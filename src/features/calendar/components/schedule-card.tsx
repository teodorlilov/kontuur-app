'use client'

import { memo, useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Copy, Mail } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { formatScheduledAt, isoToDateTimeFields, toDateKey } from '@/utils/date-helpers'
import { PLATFORMS } from '@/utils/constants'
import { CarouselSlides } from '@/components/posts/carousel-slides'
import { QualityScores } from '@/components/posts/quality-scores'
import { SCORE_BAND_VARS, scoreBand, scoreTextColor } from '@/components/ui/colors/score-colors'
import { ClientResponseCard } from '@/features/calendar/components/client-response-card'
import { Button } from '@/components/ui/button'
import { CanvasEditor } from '@/features/canvas-editor/components/canvas-editor'
import { slideCopyAt } from '@/features/canvas-editor/lib/slide-copy'
import type { EditorSlide } from '@/features/canvas-editor/types'
import { ImageSlot } from '@/features/publishing/components/image-slot'
import { useCanvaStatus } from '@/features/publishing/hooks/use-canva-status'
import { useGenerateVisuals } from '@/features/publishing/hooks/use-generate-visuals'
import { missingImagePositions } from '@/features/publishing/lib/image-list'
import { extractAllFlaggedSlides } from '@/utils/extract-flagged-slides'
import {
  parseStoredValidation,
  type StoredValidation,
} from '@/lib/validation/stored-validation-schema'
import type { CalendarPost, CarouselSlide, PostImage } from '@/types/api'

interface ContentUpdates {
  caption?: string
  slides_json?: unknown
}

interface ScheduleCardProps {
  post: CalendarPost | null
  /** The agency zone. The date/time pair is wall-clock in it, on read and on write. */
  timeZone: string
  /**
   * The suggested slot this card was opened from, when it was.
   *
   * Prefills the date and time so placing into a gap is one click rather than two date
   * pickers. Its time is a *suggestion* from `best_time_json`, not evidence — the card
   * says so and the field stays editable.
   */
  slotPrefill?: { clientId: string; at: string } | null
  postIndex: number
  totalPosts: number
  isOpen: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onSchedule: (postId: string, scheduledAt: string, platform: string) => Promise<void>
  onUnschedule: (postId: string) => void
  onSkip: (postId: string) => void
  onDelete: (postId: string) => void
  onSendApproval?: (postId: string) => void
  /** Put a failed post back in the publish queue at the time the form is showing. */
  onRearm?: (postId: string, scheduledAt: string) => void
  approvalSending?: boolean
  isScheduling: boolean
  editMode?: boolean
  onExitEditMode?: () => void
  onSaveContent?: (postId: string, updates: ContentUpdates) => Promise<boolean>
  onSaveAndResend?: (postId: string, updates: ContentUpdates) => Promise<void>
  onPublished?: (postId: string) => void
  onImageUpserted: (postId: string, image: PostImage) => void
  onImageDeleted: (postId: string, imageId: string) => void
}

/** The uppercase section label, as DESIGN.md's Label role. Tracking is on the token. */
const SECTION_LABEL = 'block mb-1.5 text-label font-semibold uppercase text-text2'
/** Same role where the caller supplies its own display/margin. */
const SECTION_LABEL_BARE = 'text-label font-semibold uppercase text-text2'

/** The caption block's frame — Body role (which already carries 1.6) on an ink wash. */
const CAPTION_CONTAINER =
  'rounded-md border border-line bg-ink/[0.025] px-3.5 py-3 text-body text-ink'

/** Footer buttons shown when the modal is in edit mode. */
function EditModeFooter({
  onSave,
  onSaveAndResend,
  onCancel,
  saving,
}: {
  onSave: () => void
  onSaveAndResend: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2 border-t border-ink/[0.07] px-6 py-3.5">
      <Button variant="secondary" onClick={onSave} disabled={saving} loading={saving}>
        Save changes
      </Button>
      <Button onClick={onSaveAndResend} disabled={saving} loading={saving} className="flex-1">
        Save &amp; re-send for approval
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

/** Centred floating card modal for post detail and scheduling. */
export const ScheduleCard = memo(function ScheduleCard({
  post,
  timeZone,
  slotPrefill,
  postIndex,
  totalPosts,
  isOpen,
  onClose,
  onPrev,
  onNext,
  onSchedule,
  onUnschedule,
  onSkip,
  onDelete,
  onSendApproval,
  onRearm,
  approvalSending,
  isScheduling,
  editMode,
  onExitEditMode,
  onSaveContent,
  onSaveAndResend,
  onPublished,
  onImageUpserted,
  onImageDeleted,
}: ScheduleCardProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [platform, setPlatform] = useState('')
  const [draftCaption, setDraftCaption] = useState('')
  const [draftSlides, setDraftSlides] = useState<CarouselSlide[]>([])
  const [savingContent, setSavingContent] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const canvaConnected = useCanvaStatus()

  // Reset / pre-fill when post changes.
  // Left as an effect deliberately: it seeds seven independent fields from one prop, and the
  // render-time adjustment pattern would mean seven paired comparisons for no behavioural gain.
  /* eslint-disable react-hooks/set-state-in-effect -- see above: seven independent
     fields seeded from one prop, deliberately not a render-time adjustment. */
  useEffect(() => {
    if (slotPrefill) {
      // Opened from a suggested slot: the slot decides when, not whatever the post
      // happened to carry.
      const { date: slotDate, time: slotTime } = isoToDateTimeFields(slotPrefill.at, timeZone)
      setDate(slotDate)
      setTime(slotTime)
    } else if (post?.scheduled_at) {
      // One zone for both fields. This was `toISOString().slice(0,10)` — the UTC date —
      // beside `toTimeString().slice(0,5)` — the browser's time. Reopening a post and
      // pressing Update rewrote it at the wrong instant, by whatever the offset was.
      const { date: prefillDate, time: prefillTime } = isoToDateTimeFields(
        post.scheduled_at,
        timeZone
      )
      setDate(prefillDate)
      setTime(prefillTime)
    } else {
      setDate('')
      setTime('09:00')
    }
    setPlatform(post?.platform ?? 'Instagram')
    setDraftCaption(post?.caption ?? '')
    setDraftSlides(Array.isArray(post?.slides_json) ? (post.slides_json as CarouselSlide[]) : [])
    setPublishError(null)
    // In the review deck this card stays mounted while `post` advances, so a
    // spinner left true by the previous post would render every following post
    // mid-publish forever.
    setPublishing(false)
  }, [
    post?.id,
    post?.platform,
    post?.scheduled_at,
    post?.caption,
    post?.slides_json,
    timeZone,
    slotPrefill,
  ])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Delegate merging to the calendar state hook (functional updates) — computing the merged array
  // here from a captured `post` snapshot loses images when concurrent generations complete.
  const handleImageUploaded = useCallback(
    (image: PostImage) => {
      if (!post) return
      onImageUpserted(post.id, image)
    },
    [post, onImageUpserted]
  )

  const handleImageDeleted = useCallback(
    (imageId: string) => {
      if (!post) return
      onImageDeleted(post.id, imageId)
    },
    [post, onImageDeleted]
  )

  const getSlideCopy = useCallback(
    (position: number) =>
      post
        ? slideCopyAt(
            {
              post_type: post.post_type,
              slides_json: post.slides_json,
              caption: post.caption ?? null,
            },
            position
          )
        : null,
    [post]
  )

  const { generatingPositions, composingPositions, generate, recompose } = useGenerateVisuals(
    post?.id ?? '',
    handleImageUploaded,
    getSlideCopy
  )
  const [editingPosition, setEditingPosition] = useState<number | null>(null)

  if (!isOpen || !post) return null

  // Capture for use in closures after null check
  const currentPost = post
  const images = currentPost.images ?? []
  const isScheduled = currentPost.status === 'scheduled'
  const isPublished = currentPost.status === 'published'
  const isFailed = currentPost.status === 'failed'
  /** A sent approval nobody can act on any more — the link's own deadline has passed. */
  const approvalLapsed =
    currentPost.approval_status === 'pending' &&
    currentPost.approval_expires_at !== null &&
    new Date(currentPost.approval_expires_at) < new Date()
  const slides = Array.isArray(currentPost.slides_json)
    ? (currentPost.slides_json as CarouselSlide[])
    : []
  const isCarousel = currentPost.post_type === 'carousel'
  const totalImageSlots = isCarousel ? slides.length : 1
  const missingPositions = missingImagePositions(images, totalImageSlots, generatingPositions)
  const slotsWithoutImage = totalImageSlots - images.length
  // No point generating visuals for content that is already (or currently being) published.
  const canGenerateVisuals = !isPublished && currentPost.status !== 'publishing'
  const pillarColor = currentPost.pillar ? getPillarColor(currentPost.pillar) : null
  const score = currentPost.quality_score_avg
  const validation = parseStoredValidation(currentPost.validation_json)

  function handleSchedule() {
    if (!date) return
    const scheduledAt = formatScheduledAt(date, time || '09:00', timeZone)
    // A failed post cannot be moved by `updatePost` — 'failed' is not user-settable —
    // and would stay stuck at the scheduler's attempt limit even if it could. The form
    // is the same; only the write differs.
    if (isFailed && onRearm) {
      onRearm(currentPost.id, scheduledAt)
      return
    }
    void onSchedule(currentPost.id, scheduledAt, platform)
  }

  function handleCopyCaption() {
    if (!currentPost.caption) return
    void navigator.clipboard.writeText(currentPost.caption)
    toast.success('Copied to clipboard')
  }

  async function handlePublishNow() {
    setPublishing(true)
    setPublishError(null)
    try {
      const res = await fetch(`/api/posts/${currentPost.id}/publish`, { method: 'POST' })
      const data = await res.json()
      if (res.status === 202) {
        // Container still processing at Meta — the cron completes it; the post
        // is not published yet, so the card must not flip it.
        toast.info(
          data.message ?? 'Instagram is still processing — publishing completes automatically'
        )
        onClose()
      } else if (res.ok) {
        onPublished?.(currentPost.id)
        onClose()
      } else {
        setPublishError(data.error ?? 'Publish failed')
      }
    } catch {
      // A thrown fetch (network drop) must not strand the spinner.
      setPublishError('Publish failed — check your connection and try again')
    } finally {
      // Always reset: onClose() does not unmount this card in the review deck,
      // so a spinner left true here would carry to the next post.
      setPublishing(false)
    }
  }

  const flaggedSlideNumbers = editMode
    ? extractAllFlaggedSlides(currentPost.approval_client_note)
    : undefined

  function buildContentUpdates(): ContentUpdates {
    return {
      caption: draftCaption,
      ...(draftSlides.length > 0 ? { slides_json: draftSlides } : {}),
    }
  }

  async function handleSaveOnly() {
    if (!onSaveContent) return
    setSavingContent(true)
    const ok = await onSaveContent(currentPost.id, buildContentUpdates())
    setSavingContent(false)
    if (ok) {
      recomposeBakedText(buildContentUpdates())
      onExitEditMode?.()
    }
  }

  async function handleSaveAndResendApproval() {
    if (!onSaveAndResend) return
    setSavingContent(true)
    await onSaveAndResend(currentPost.id, buildContentUpdates())
    setSavingContent(false)
    recomposeBakedText(buildContentUpdates())
    onExitEditMode?.()
  }

  // Copy edits never regenerate the AI art — but baked text re-composes from the fresh values
  // (the `post` prop lags the optimistic save, so the just-saved fields come in explicitly).
  function recomposeBakedText(updates: ContentUpdates) {
    void recompose(
      {
        post_type: currentPost.post_type,
        slides_json: updates.slides_json ?? currentPost.slides_json,
        caption: updates.caption ?? currentPost.caption ?? null,
      },
      images
    )
  }

  // Every slide that HAS an image is editable, so the editor can carousel between them; an empty
  // slot has nothing to open. Ascending, because the strip reads left to right.
  const editorSlides: EditorSlide[] = images
    .map((image) => ({
      position: image.position,
      image: { publicUrl: image.publicUrl, storagePath: image.storagePath },
      slideCopy: getSlideCopy(image.position),
    }))
    .sort((a, b) => a.position - b.position)
  const canEditPosition =
    editingPosition !== null && editorSlides.some((slide) => slide.position === editingPosition)

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-forest-deep/[0.32] p-3 backdrop-blur-[4px]"
    >
      <div className="flex max-h-[85vh] w-full max-w-[780px] flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--sh-frame),0_0_0_1px_rgba(15,21,18,0.06)]">
        {/* Card header */}
        <div className="shrink-0 border-b border-ink/[0.07] px-6 pb-4 pt-[22px]">
          <div className="mb-2.5 flex items-start justify-between">
            {/* Sans, not the display serif: client names may be Cyrillic and
                Instrument Serif has no Cyrillic glyphs.
                tracking-[-0.01em]: the Display role ships untracked, and a name
                set at 18px needs the same optical tightening the ramp gives its
                larger steps. */}
            <div className="text-display font-semibold tracking-[-0.01em] text-ink">
              {currentPost.client_name}
            </div>
            <div className="flex items-center gap-2">
              {/* Post navigator — hidden for scheduled posts opened from the grid */}
              {postIndex >= 0 && (
                <div className="flex items-center gap-[5px]">
                  <NavBtn onClick={onPrev} disabled={postIndex === 0}>
                    <ChevronLeft className="size-3" />
                  </NavBtn>
                  {/* tracking-normal cancels the Label role's built-in 0.16em. */}
                  <span className="text-label tracking-normal text-text2">
                    {postIndex + 1} of {totalPosts}
                  </span>
                  <NavBtn onClick={onNext} disabled={postIndex === totalPosts - 1}>
                    <ChevronRight className="size-3" />
                  </NavBtn>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-line2 bg-surface text-text2"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Tag pills */}
          <div className="flex flex-wrap gap-1.5">
            <TagPill
              bg={
                isPublished
                  ? 'rgba(46,158,104,0.12)'
                  : isFailed
                    ? 'rgba(180,50,50,0.12)'
                    : isScheduled
                      ? 'var(--marker)'
                      : 'rgba(15,21,18,0.06)'
              }
              color={
                isPublished
                  ? 'var(--forest)'
                  : isFailed
                    ? 'var(--danger)'
                    : isScheduled
                      ? 'var(--forest-deep)'
                      : 'var(--text2)'
              }
            >
              {isPublished
                ? 'Published'
                : isFailed
                  ? 'Failed'
                  : currentPost.status === 'publishing'
                    ? 'Publishing'
                    : isScheduled
                      ? 'Scheduled'
                      : 'Unscheduled'}
            </TagPill>
            {/* Priority is attention, so Amber — it was a terracotta wash under
                green ink, because --color-terracotta aliased to --spring. */}
            {currentPost.priority && (
              <TagPill bg="var(--pending-bg)" color="var(--pending)">
                Priority
              </TagPill>
            )}
            {currentPost.pillar && pillarColor && (
              <TagPill bg={pillarColor.bg} color={pillarColor.text} dot={pillarColor.hex}>
                {currentPost.pillar}
              </TagPill>
            )}
            {currentPost.platform && (
              <TagPill bg="rgba(44,111,165,0.10)" color="var(--forest)">
                {currentPost.platform}
              </TagPill>
            )}
            <TagPill bg="rgba(15,21,18,0.06)" color="var(--text2)">
              {isCarousel ? `Carousel \u00B7 ${slides.length} slides` : 'Single image'}
            </TagPill>
            {score === null ? (
              // The neutral tone the design system reserves for "no judgement" —
              // absence is a fact about the post, not a verdict on it.
              <TagPill bg="rgba(15,21,18,0.05)" color="var(--text3)">
                Not scored
              </TagPill>
            ) : (
              // The shared banding. This pill used to split at 9/7 while the sidebar
              // forty pixels away split at 7, so an 8 read amber here and green there.
              <TagPill {...SCORE_BAND_VARS[scoreBand(score)]}>{score}/10</TagPill>
            )}
            {images.length > 0 && (
              <TagPill bg="rgba(15,21,18,0.06)" color="var(--text2)">
                {images.length} of {totalImageSlots} images
              </TagPill>
            )}
            {currentPost.approval_status === 'approved' && (
              <TagPill bg="rgba(46,158,104,0.12)" color="var(--forest)">
                ✓ Client approved
                {currentPost.approval_responded_at &&
                  ` · ${formatRelativeTime(parseTimestamp(currentPost.approval_responded_at))}`}
              </TagPill>
            )}
            {currentPost.approval_status === 'changes_requested' && (
              <TagPill bg="rgba(22,68,48,0.10)" color="var(--forest)">
                ◻ Changes requested
                {currentPost.approval_responded_at &&
                  ` · ${formatRelativeTime(parseTimestamp(currentPost.approval_responded_at))}`}
              </TagPill>
            )}
            {/* Sent and unanswered. This fell through every branch above, so a post
                waiting on a client looked identical to one nobody had ever sent — and a
                link that has since lapsed looked identical to both. The distinction
                decides whether the agency waits or re-sends. */}
            {currentPost.approval_status === 'pending' &&
              (approvalLapsed ? (
                <TagPill bg="rgba(138,97,22,0.12)" color="var(--pending)">
                  ⧗ Approval link expired
                </TagPill>
              ) : (
                <TagPill bg="rgba(138,97,22,0.12)" color="var(--pending)">
                  ⧗ Awaiting client
                </TagPill>
              ))}
            {editMode && (
              <TagPill bg="rgba(22,68,48,0.12)" color="var(--forest)">
                ✏ Editing
              </TagPill>
            )}
          </div>
        </div>

        {/* Card body — two columns on desktop, stacked & scrollable on mobile */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* Left: caption + slides + schedule form */}
          <div className="flex flex-1 flex-col gap-3.5 px-[22px] py-[18px] md:overflow-y-auto md:border-r md:border-[rgba(15,21,18,0.07)]">
            {/* Client response */}
            {(currentPost.approval_status === 'approved' ||
              currentPost.approval_status === 'changes_requested') && (
              <ClientResponseCard
                approvalStatus={currentPost.approval_status}
                clientNote={currentPost.approval_client_note}
                respondedAt={currentPost.approval_responded_at}
                clientName={currentPost.client_name}
              />
            )}

            {/* Caption */}
            <div>
              <div className="mb-1.5 flex justify-between">
                <span className={SECTION_LABEL_BARE}>Caption</span>
                {/* tracking-normal cancels the Label role's built-in 0.16em. */}
                <button
                  className="flex cursor-pointer items-center gap-[3px] border-none bg-transparent text-label tracking-normal text-text2"
                  type="button"
                  onClick={handleCopyCaption}
                >
                  <Copy className="size-2.5" />
                  Copy
                </button>
              </div>
              <textarea
                value={draftCaption}
                onChange={(e) => setDraftCaption(e.target.value)}
                onBlur={() => {
                  if (draftCaption !== (currentPost.caption ?? '') && onSaveContent) {
                    void onSaveContent(currentPost.id, { caption: draftCaption })
                    recomposeBakedText({ caption: draftCaption })
                  }
                }}
                className={cn(
                  CAPTION_CONTAINER,
                  'min-h-[120px] w-full resize-y whitespace-pre-wrap'
                )}
                // outline-none would let the global :focus-visible ring through —
                // that rule is unlayered and outranks any utility.
                style={{ outline: 'none' }}
              />
            </div>

            {/* Carousel slides */}
            {isCarousel && slides.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <span className={SECTION_LABEL}>Carousel slides</span>
                  {canGenerateVisuals && slotsWithoutImage > 0 && (
                    // tracking-normal cancels the Label role's built-in 0.16em.
                    <button
                      className={cn(
                        'border-none bg-transparent p-0 text-label font-medium tracking-normal text-spring-text',
                        missingPositions.length === 0
                          ? 'cursor-default opacity-60'
                          : 'cursor-pointer'
                      )}
                      type="button"
                      onClick={() => {
                        void generate(missingPositions)
                      }}
                      disabled={missingPositions.length === 0}
                    >
                      {missingPositions.length === 0
                        ? '✨ Generating visuals…'
                        : `✨ Generate visuals (${slotsWithoutImage})`}
                    </button>
                  )}
                </div>
                <CarouselSlides
                  slides={draftSlides.length > 0 ? draftSlides : slides}
                  editable
                  onSlidesChange={setDraftSlides}
                  onBlur={() => {
                    if (onSaveContent && draftSlides.length > 0) {
                      void onSaveContent(currentPost.id, { slides_json: draftSlides })
                      if (JSON.stringify(draftSlides) !== JSON.stringify(slides)) {
                        recomposeBakedText({ slides_json: draftSlides })
                      }
                    }
                  }}
                  flaggedSlides={flaggedSlideNumbers}
                  postId={currentPost.id}
                  images={images}
                  onImageUploaded={handleImageUploaded}
                  onImageDeleted={handleImageDeleted}
                  canvaConnected={canvaConnected}
                  onGenerateImage={
                    canGenerateVisuals
                      ? (position) => {
                          void generate([position])
                        }
                      : undefined
                  }
                  generatingPositions={generatingPositions}
                  composingPositions={composingPositions}
                  onEditImage={canGenerateVisuals ? setEditingPosition : undefined}
                />
              </div>
            )}

            {/* Single post image slot */}
            {!isCarousel && (
              <div>
                <span className={SECTION_LABEL}>Image</span>
                <ImageSlot
                  postId={currentPost.id}
                  position={0}
                  image={images.find((img) => img.position === 0) ?? null}
                  onUploaded={handleImageUploaded}
                  onDeleted={handleImageDeleted}
                  canvaConnected={canvaConnected}
                  onGenerate={
                    canGenerateVisuals
                      ? () => {
                          void generate([0])
                        }
                      : undefined
                  }
                  generating={generatingPositions.includes(0)}
                  composing={composingPositions.includes(0)}
                  onEdit={canGenerateVisuals ? () => setEditingPosition(0) : undefined}
                />
              </div>
            )}

            {/* Schedule form — hidden in edit mode */}
            {!editMode && (
              <ScheduleForm
                date={date}
                time={time}
                platform={platform}
                onDateChange={setDate}
                onTimeChange={setTime}
                onPlatformChange={setPlatform}
                timeZone={timeZone}
              />
            )}
          </div>

          {/* Right: quality + source */}
          <QualitySidebar score={score} validation={validation} currentPost={currentPost} />
        </div>

        {/* Card footer — edit mode vs normal */}
        {editMode ? (
          <EditModeFooter
            onSave={() => {
              void handleSaveOnly()
            }}
            onSaveAndResend={() => {
              void handleSaveAndResendApproval()
            }}
            onCancel={() => onExitEditMode?.()}
            saving={savingContent}
          />
        ) : (
          <NormalFooter
            date={date}
            isScheduled={isScheduled}
            isPublished={isPublished}
            isScheduling={isScheduling}
            currentPost={currentPost}
            images={images}
            publishing={publishing}
            publishError={publishError}
            approvalSending={approvalSending}
            onSchedule={handleSchedule}
            onUnschedule={onUnschedule}
            onSkip={onSkip}
            onSendApproval={onSendApproval}
            onDelete={onDelete}
            onPublishNow={() => {
              void handlePublishNow()
            }}
          />
        )}
      </div>
      {canEditPosition && editingPosition !== null && (
        <CanvasEditor
          target={{ kind: 'post', postId: currentPost.id }}
          slides={editorSlides}
          initialPosition={editingPosition}
          onClose={() => setEditingPosition(null)}
          onSaved={handleImageUploaded}
        />
      )}
    </div>
  )
})

function NavBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-6 items-center justify-center rounded-[5px] border border-line2 bg-surface text-text2',
        disabled ? 'cursor-default opacity-30' : 'cursor-pointer'
      )}
      // `opacity 0.15s` rides the default `ease`; Tailwind's transition-* would
      // swap in its own curve.
      style={{ transition: 'opacity 0.15s' }}
    >
      {children}
    </button>
  )
}

function TagPill({
  bg,
  color,
  dot,
  children,
}: {
  bg: string
  color: string
  dot?: string
  children: React.ReactNode
}) {
  // bg/color are CSS values, never Tailwind classes. This used to branch on a
  // `bg-`/`text-` prefix to accept both; all eleven call sites pass `rgba()` or
  // `var(--…)`, so the class arm never once ran.
  return (
    // tracking-normal cancels the Label role's built-in 0.16em.
    <span
      className="inline-flex items-center gap-1 rounded-[5px] px-2 py-[3px] text-label font-medium tracking-normal"
      style={{ background: bg, color }}
    >
      {/* The dot carries the pillar's own hue, so it stays a value. */}
      {dot && <span className="size-[5px] shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}

/** Date/time/platform scheduling form. */
function ScheduleForm({
  date,
  time,
  platform,
  onDateChange,
  onTimeChange,
  onPlatformChange,
  timeZone,
}: {
  date: string
  time: string
  platform: string
  onDateChange: (v: string) => void
  onTimeChange: (v: string) => void
  onPlatformChange: (v: string) => void
  timeZone: string
}) {
  // The floor is today in the *agency's* zone. It was `toISOString().slice(0,10)` — UTC
  // today — which for an agency ahead of UTC blocks their own current day after 00:00
  // local, and for one behind it offers a day that has already passed.
  const todayKey = toDateKey(new Date(), timeZone)
  return (
    <div className="flex flex-col gap-2.5 border-t border-ink/[0.07] pt-3.5">
      <div className="flex gap-2.5">
        <ScheduleInput
          id="card-date"
          label="Date"
          type="date"
          value={date}
          onChange={onDateChange}
          min={todayKey}
        />
        <ScheduleInput
          id="card-time"
          label="Time"
          type="time"
          value={time}
          onChange={onTimeChange}
        />
      </div>
      <div className="flex flex-col gap-1">
        {/* tracking-normal cancels the Label role's built-in 0.16em. */}
        <span className="text-label font-medium tracking-normal text-text2">Platform</span>
        <div className="flex flex-wrap gap-[5px]">
          {PLATFORMS.map((p) => (
            // tracking-normal cancels the Label role's built-in 0.16em.
            <button
              key={p}
              type="button"
              onClick={() => onPlatformChange(p)}
              className={cn(
                'cursor-pointer rounded-[5px] px-2.5 py-[5px] text-label font-medium tracking-normal',
                platform === p
                  ? 'border-none bg-forest text-ink-inv'
                  : 'border border-line2 bg-surface text-text2'
              )}
              // `all 0.15s` rides the default `ease`; Tailwind's transition-*
              // would swap in its own curve.
              style={{ transition: 'all 0.15s' }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScheduleInput({
  id,
  label,
  type,
  value,
  onChange,
  min,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  min?: string
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      {/* tracking-normal cancels the Label role's built-in 0.16em. */}
      <label htmlFor={id} className="text-label font-medium tracking-normal text-text2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[7px] border border-line2 px-2.5 py-[7px] text-lead text-ink md:text-caption"
        // outline-none would let the global :focus-visible ring through — that
        // rule is unlayered and outranks any utility.
        style={{ outline: 'none' }}
      />
    </div>
  )
}

/** Right-hand sidebar with quality scores and source info. */
function QualitySidebar({
  score,
  validation,
  currentPost,
}: {
  score: number | null
  validation: StoredValidation | null
  currentPost: CalendarPost
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 border-t border-[rgba(15,21,18,0.07)] p-[18px] md:w-[260px] md:overflow-y-auto md:border-t-0">
      <div className="text-center">
        <span className={cn(SECTION_LABEL_BARE, 'block mb-1')}>Quality</span>
        <span
          // Unjudged takes the neutral ink: it has not earned a verdict in either
          // direction, and the `?? 0` this replaced rendered it as a red 0 — a failing
          // grade for a check that never ran.
          className={cn(
            'text-metric font-semibold',
            score === null ? 'text-text3' : scoreTextColor(score)
          )}
        >
          {score ?? '—'}
        </span>
      </div>

      {validation && <QualityScores criteria={validation.criteria} scores={validation.scores} />}

      {validation?.criteria.issues && validation.criteria.issues.length > 0 && (
        <div className="rounded-sm bg-spring/[0.08] px-3 py-2.5">
          {validation.criteria.issues.map((issue, i) => (
            // leading-[1.5]: a stacked list of quoted issues, set tighter than
            // running Micro copy so each quote reads as its own unit.
            <p
              key={i}
              className={cn(
                'text-micro leading-[1.5] text-spring-text',
                i < validation.criteria.issues.length - 1 && 'mb-1.5'
              )}
            >
              &ldquo;{issue.description}&rdquo;
            </p>
          ))}
        </div>
      )}

      {currentPost.source_title && (
        <div>
          <span className={SECTION_LABEL}>Source</span>
          <p className="mb-1 text-micro font-medium text-ink">
            {currentPost.source_type ? `${currentPost.source_type} \u00B7 ` : ''}
            {currentPost.source_title}
          </p>
          {currentPost.source_excerpt && (
            // leading-[1.45]: a three-line clamp reads as a block, so it sets
            // tighter than Micro's own rhythm would leave it.
            <p className="mb-1.5 line-clamp-3 text-micro leading-[1.45] text-text2">
              {currentPost.source_excerpt}
            </p>
          )}
          {currentPost.source_url && (
            <a
              href={currentPost.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-micro text-spring-text no-underline"
            >
              Verify on Google &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/** Footer buttons for the normal (non-edit) mode. */
function NormalFooter({
  date,
  isScheduled,
  isPublished,
  isScheduling,
  currentPost,
  images,
  publishing,
  publishError,
  approvalSending,
  onSchedule,
  onUnschedule,
  onSkip,
  onSendApproval,
  onDelete,
  onPublishNow,
}: {
  date: string
  isScheduled: boolean
  isPublished: boolean
  isScheduling: boolean
  currentPost: CalendarPost
  images: PostImage[]
  publishing: boolean
  publishError: string | null
  approvalSending?: boolean
  onSchedule: () => void
  onUnschedule: (id: string) => void
  onSkip: (id: string) => void
  onSendApproval?: (id: string) => void
  onDelete: (id: string) => void
  onPublishNow: () => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2 border-t border-ink/[0.07] px-6 py-3.5">
      <Button
        onClick={onSchedule}
        disabled={!date || isScheduling}
        loading={isScheduling}
        className="flex-1"
      >
        {currentPost.status === 'failed'
          ? 'Retry publish'
          : isScheduled
            ? 'Update schedule'
            : 'Schedule to calendar'}
      </Button>
      {isScheduled ? (
        <Button variant="secondary" onClick={() => onUnschedule(currentPost.id)}>
          Unschedule
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => onSkip(currentPost.id)}>
          Skip for now
        </Button>
      )}
      {isScheduled && onSendApproval && (
        <Button
          variant="secondary"
          onClick={() => onSendApproval(currentPost.id)}
          disabled={approvalSending}
          loading={approvalSending}
        >
          <Mail className="size-3" /> Send for approval
        </Button>
      )}
      {images.length > 0 &&
        !isPublished &&
        currentPost.status !== 'publishing' &&
        currentPost.platform === 'Instagram' && (
          <Button onClick={onPublishNow} disabled={publishing} loading={publishing}>
            Publish to Instagram
          </Button>
        )}
      <Button variant="danger" onClick={() => onDelete(currentPost.id)}>
        Delete post
      </Button>
      {/* This attempt's error, then the stored reason from the last one. Both, and in
          that order: a retry that fails for a new reason must not be explained by the
          old one still sitting in the column. */}
      {publishError && (
        <div className="w-full rounded-[6px] bg-danger-bg px-2.5 py-2 text-micro text-danger">
          {publishError}
        </div>
      )}
      {!publishError && currentPost.status === 'failed' && currentPost.publish_error && (
        <div className="w-full rounded-[6px] bg-danger-bg px-2.5 py-2 text-micro text-danger">
          Last attempt failed: {currentPost.publish_error}
        </div>
      )}
    </div>
  )
}
