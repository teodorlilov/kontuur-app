'use client'

import { memo, useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Copy, Mail } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { PLATFORMS } from '@/utils/constants'
import { CarouselSlides } from '@/components/posts/carousel-slides'
import { QualityScores } from '@/components/posts/quality-scores'
import { ClientResponseCard } from '@/features/calendar/components/client-response-card'
import { Button } from '@/components/ui/button'
import { ImageSlot } from '@/features/publishing/components/image-slot'
import { useCanvaStatus } from '@/features/publishing/hooks/use-canva-status'
import { extractAllFlaggedSlides } from '@/utils/extract-flagged-slides'
import type {
  CalendarPost,
  CarouselSlide,
  PostImage,
  ValidationCriteria,
  ValidationScores,
} from '@/types/api'

interface ContentUpdates {
  caption?: string
  slides_json?: unknown
}

interface ScheduleCardProps {
  post: CalendarPost | null
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
  approvalSending?: boolean
  isScheduling: boolean
  editMode?: boolean
  onExitEditMode?: () => void
  onSaveContent?: (postId: string, updates: ContentUpdates) => Promise<boolean>
  onSaveAndResend?: (postId: string, updates: ContentUpdates) => Promise<void>
  onPublished?: (postId: string) => void
  onImagesChange: (postId: string, images: PostImage[]) => void
}

interface ParsedValidation {
  criteria: ValidationCriteria
  scores: ValidationScores
}

function parseValidation(json: unknown): ParsedValidation | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (obj.criteria && obj.scores) {
    return { criteria: obj.criteria as ValidationCriteria, scores: obj.scores as ValidationScores }
  }
  return null
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  color: 'var(--color-muted)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
}

const CAPTION_CONTAINER_STYLE = {
  fontSize: 13,
  color: 'var(--color-text-1)',
  lineHeight: 1.6,
  background: 'rgba(44,62,80,0.025)',
  borderRadius: 10,
  padding: '12px 14px',
  border: '0.5px solid var(--color-border-1)',
} as const

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
    <div
      style={{
        padding: '14px 24px',
        borderTop: '0.5px solid rgba(44,62,80,0.07)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <Button variant="secondary" onClick={onSave} disabled={saving} loading={saving}>
        Save changes
      </Button>
      <Button onClick={onSaveAndResend} disabled={saving} loading={saving} style={{ flex: 1 }}>
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
  approvalSending,
  isScheduling,
  editMode,
  onExitEditMode,
  onSaveContent,
  onSaveAndResend,
  onPublished,
  onImagesChange,
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

  // Reset / pre-fill when post changes
  useEffect(() => {
    if (post?.scheduled_at) {
      const d = new Date(post.scheduled_at)
      setDate(d.toISOString().slice(0, 10))
      setTime(d.toTimeString().slice(0, 5))
    } else {
      setDate('')
      setTime('09:00')
    }
    setPlatform(post?.platform ?? 'Instagram')
    setDraftCaption(post?.caption ?? '')
    setDraftSlides(Array.isArray(post?.slides_json) ? (post.slides_json as CarouselSlide[]) : [])
    setPublishError(null)
  }, [post?.id, post?.platform, post?.scheduled_at, post?.caption, post?.slides_json])

  const handleImageUploaded = useCallback((image: PostImage) => {
    if (!post) return
    const next = [...(post.images ?? []).filter((img) => img.position !== image.position), image]
      .sort((a, b) => a.position - b.position)
    onImagesChange(post.id, next)
  }, [post, onImagesChange])

  const handleImageDeleted = useCallback((imageId: string) => {
    if (!post) return
    onImagesChange(post.id, (post.images ?? []).filter((img) => img.id !== imageId))
  }, [post, onImagesChange])

  if (!isOpen || !post) return null

  // Capture for use in closures after null check
  const currentPost = post
  const images = currentPost.images ?? []
  const isScheduled = currentPost.status === 'scheduled'
  const isPublished = currentPost.status === 'published'
  const isFailed = currentPost.status === 'failed'
  const slides = Array.isArray(currentPost.slides_json) ? (currentPost.slides_json as CarouselSlide[]) : []
  const isCarousel = currentPost.post_type === 'carousel'
  const totalImageSlots = isCarousel ? slides.length : 1
  const pillarColor = currentPost.pillar ? getPillarColor(currentPost.pillar) : null
  const score = currentPost.quality_score_avg ?? 0
  const validation = parseValidation(currentPost.validation_json)

  function handleSchedule() {
    if (!date) return
    const scheduledAt = new Date(`${date}T${time || '09:00'}:00`).toISOString()
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
    const res = await fetch(`/api/posts/${currentPost.id}/publish`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      onPublished?.(currentPost.id)
      onClose()
    } else {
      setPublishError(data.error ?? 'Publish failed')
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
    if (ok) onExitEditMode?.()
  }

  async function handleSaveAndResendApproval() {
    if (!onSaveAndResend) return
    setSavingContent(true)
    await onSaveAndResend(currentPost.id, buildContentUpdates())
    setSavingContent(false)
    onExitEditMode?.()
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        background: 'rgba(26,38,48,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 780,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(26,38,48,0.28), 0 0 0 0.5px rgba(44,62,80,0.12)',
          overflow: 'hidden',
        }}
      >
        {/* Card header */}
        <div
          style={{
            padding: '22px 24px 16px',
            borderBottom: '0.5px solid rgba(44,62,80,0.07)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: 20,
                fontWeight: 400,
                color: 'var(--color-text-1)',
              }}
            >
              {currentPost.client_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Post navigator — hidden for scheduled posts opened from the grid */}
              {postIndex >= 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <NavBtn onClick={onPrev} disabled={postIndex === 0}>
                    <ChevronLeft style={{ width: 12, height: 12 }} />
                  </NavBtn>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                    {postIndex + 1} of {totalPosts}
                  </span>
                  <NavBtn onClick={onNext} disabled={postIndex === totalPosts - 1}>
                    <ChevronRight style={{ width: 12, height: 12 }} />
                  </NavBtn>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  border: '0.5px solid var(--color-border-2)',
                  borderRadius: 7,
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--color-muted)',
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Tag pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <TagPill
              bg={isPublished ? 'rgba(90,138,74,0.12)' : isFailed ? 'rgba(180,50,50,0.12)' : isScheduled ? 'var(--color-scheduled-bg)' : 'rgba(44,62,80,0.06)'}
              color={isPublished ? '#2A5A1A' : isFailed ? '#B43232' : isScheduled ? 'var(--color-scheduled-fg)' : '#4A5060'}
            >
              {isPublished ? 'Published' : isFailed ? 'Failed' : currentPost.status === 'publishing' ? 'Publishing' : isScheduled ? 'Scheduled' : 'Unscheduled'}
            </TagPill>
            {currentPost.priority && (
              <TagPill bg="rgba(192,123,85,0.14)" color="var(--color-terracotta)">
                Priority
              </TagPill>
            )}
            {currentPost.pillar && pillarColor && (
              <TagPill bg={pillarColor.bg} color={pillarColor.text} dot={pillarColor.hex}>
                {currentPost.pillar}
              </TagPill>
            )}
            {currentPost.platform && (
              <TagPill bg="rgba(44,111,165,0.10)" color="#2C5F8A">{currentPost.platform}</TagPill>
            )}
            <TagPill bg="rgba(44,62,80,0.06)" color="#4A5060">
              {isCarousel ? `Carousel \u00B7 ${slides.length} slides` : 'Single image'}
            </TagPill>
            <TagPill
              bg={score >= 9 ? 'rgba(90,138,74,0.12)' : score >= 7 ? 'rgba(192,123,85,0.12)' : 'rgba(180,50,50,0.12)'}
              color={score >= 9 ? '#2A5A1A' : score >= 7 ? '#7A3A25' : '#B43232'}
            >
              {score}/10
            </TagPill>
            {images.length > 0 && (
              <TagPill bg="rgba(44,62,80,0.06)" color="#4A5060">
                {images.length} of {totalImageSlots} images
              </TagPill>
            )}
            {currentPost.approval_status === 'approved' && (
              <TagPill bg="rgba(90,138,74,0.12)" color="#2A5A1A">
                ✓ Client approved
                {currentPost.approval_responded_at && ` · ${formatRelativeTime(parseTimestamp(currentPost.approval_responded_at))}`}
              </TagPill>
            )}
            {currentPost.approval_status === 'changes_requested' && (
              <TagPill bg="rgba(44,94,138,0.10)" color="#2C5F8A">
                ◻ Changes requested
                {currentPost.approval_responded_at && ` · ${formatRelativeTime(parseTimestamp(currentPost.approval_responded_at))}`}
              </TagPill>
            )}
            {editMode && (
              <TagPill bg="rgba(44,94,138,0.12)" color="#2C5F8A">
                ✏ Editing
              </TagPill>
            )}
          </div>
        </div>

        {/* Card body — two columns on desktop, stacked & scrollable on mobile */}
        <div className="flex flex-col md:flex-row overflow-y-auto md:overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
          {/* Left: caption + slides + schedule form */}
          <div
            className="md:border-r md:border-[rgba(44,62,80,0.07)] md:overflow-y-auto"
            style={{
              flex: 1,
              padding: '18px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Client response */}
            {(currentPost.approval_status === 'approved' || currentPost.approval_status === 'changes_requested') && (
              <ClientResponseCard
                approvalStatus={currentPost.approval_status}
                clientNote={currentPost.approval_client_note}
                respondedAt={currentPost.approval_responded_at}
                clientName={currentPost.client_name}
              />
            )}

            {/* Caption */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...SECTION_LABEL_STYLE, display: undefined, marginBottom: undefined }}>
                  Caption
                </span>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                    color: 'var(--color-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Copy style={{ width: 10, height: 10 }} />
                  Copy
                </button>
              </div>
              <textarea
                value={draftCaption}
                onChange={(e) => setDraftCaption(e.target.value)}
                onBlur={() => {
                  if (draftCaption !== (currentPost.caption ?? '') && onSaveContent) {
                    void onSaveContent(currentPost.id, { caption: draftCaption })
                  }
                }}
                style={{
                  ...CAPTION_CONTAINER_STYLE,
                  whiteSpace: 'pre-wrap',
                  width: '100%',
                  minHeight: 120,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Carousel slides */}
            {isCarousel && slides.length > 0 && (
              <div>
                <span style={SECTION_LABEL_STYLE}>Carousel slides</span>
                <CarouselSlides
                  slides={draftSlides.length > 0 ? draftSlides : slides}
                  editable
                  onSlidesChange={setDraftSlides}
                  onBlur={() => {
                    if (onSaveContent && draftSlides.length > 0) {
                      void onSaveContent(currentPost.id, { slides_json: draftSlides })
                    }
                  }}
                  flaggedSlides={flaggedSlideNumbers}
                  postId={currentPost.id}
                  images={images}
                  onImageUploaded={handleImageUploaded}
                  onImageDeleted={handleImageDeleted}
                  canvaConnected={canvaConnected}
                />
              </div>
            )}

            {/* Single post image slot */}
            {!isCarousel && (
              <div>
                <span style={SECTION_LABEL_STYLE}>Image</span>
                <ImageSlot
                  postId={currentPost.id}
                  position={0}
                  image={images.find((img) => img.position === 0) ?? null}
                  onUploaded={handleImageUploaded}
                  onDeleted={handleImageDeleted}
                  canvaConnected={canvaConnected}
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
              />
            )}
          </div>

          {/* Right: quality + source */}
          <QualitySidebar score={score} validation={validation} currentPost={currentPost} />
        </div>

        {/* Card footer — edit mode vs normal */}
        {editMode ? (
          <EditModeFooter
            onSave={() => { void handleSaveOnly() }}
            onSaveAndResend={() => { void handleSaveAndResendApproval() }}
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
            onPublishNow={() => { void handlePublishNow() }}
          />
        )}
      </div>
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
      style={{
        width: 24,
        height: 24,
        border: '0.5px solid var(--color-border-2)',
        borderRadius: 5,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        color: 'var(--color-muted)',
        opacity: disabled ? 0.3 : 1,
        transition: 'opacity 0.15s',
      }}
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
  // bg/color may be Tailwind classes (e.g. "bg-violet-50", "text-violet-700") or CSS values
  const isTwBg = bg.startsWith('bg-')
  const isTwText = color.startsWith('text-')
  return (
    <span
      className={cn(isTwBg && bg, isTwText && color)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: 5,
        ...(isTwBg ? {} : { background: bg }),
        ...(isTwText ? {} : { color }),
      }}
    >
      {dot && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      )}
      {children}
    </span>
  )
}

/** Date/time/platform scheduling form. */
function ScheduleForm({
  date, time, platform, onDateChange, onTimeChange, onPlatformChange,
}: {
  date: string; time: string; platform: string
  onDateChange: (v: string) => void; onTimeChange: (v: string) => void; onPlatformChange: (v: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderTop: '0.5px solid rgba(44,62,80,0.07)',
        paddingTop: 14,
      }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <ScheduleInput id="card-date" label="Date" type="date" value={date} onChange={onDateChange} min={new Date().toISOString().slice(0, 10)} />
        <ScheduleInput id="card-time" label="Time" type="time" value={time} onChange={onTimeChange} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>Platform</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPlatformChange(p)}
              style={{
                fontSize: 10, padding: '5px 10px', borderRadius: 5,
                border: platform === p ? 'none' : '0.5px solid var(--color-border-2)',
                background: platform === p ? 'var(--color-brand)' : '#fff',
                color: platform === p ? '#ECE8E1' : 'var(--color-muted)',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, transition: 'all 0.15s',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScheduleInput({ id, label, type, value, onChange, min }: {
  id: string; label: string; type: string; value: string; onChange: (v: string) => void; min?: string
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{label}</label>
      <input
        id={id} type={type} value={value} min={min}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12, border: '0.5px solid var(--color-border-2)', borderRadius: 7,
          padding: '7px 10px', fontFamily: 'inherit', outline: 'none', color: 'var(--color-text-1)',
        }}
      />
    </div>
  )
}

/** Right-hand sidebar with quality scores and source info. */
function QualitySidebar({ score, validation, currentPost }: {
  score: number; validation: ParsedValidation | null; currentPost: CalendarPost
}) {
  return (
    <div
      className="w-full md:w-[260px] border-t md:border-t-0 border-[rgba(44,62,80,0.07)] md:overflow-y-auto"
      style={{ flexShrink: 0, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ textAlign: 'center' }}>
        <span style={{ ...SECTION_LABEL_STYLE, marginBottom: 4 }}>Quality</span>
        <span style={{ fontSize: 28, fontWeight: 600, color: score >= 9 ? '#5A8A4A' : score >= 7 ? '#C07B55' : '#B43232' }}>
          {score}
        </span>
      </div>

      {validation && <QualityScores criteria={validation.criteria} scores={validation.scores} />}

      {validation?.criteria.issues && validation.criteria.issues.length > 0 && (
        <div style={{ background: 'rgba(192,123,85,0.08)', borderRadius: 8, padding: '10px 12px' }}>
          {validation.criteria.issues.map((issue, i) => (
            <p key={i} style={{ fontSize: 11, color: '#C07B55', lineHeight: 1.5, marginBottom: i < validation.criteria.issues.length - 1 ? 6 : 0 }}>
              &ldquo;{issue.description}&rdquo;
            </p>
          ))}
        </div>
      )}

      {currentPost.source_title && (
        <div>
          <span style={SECTION_LABEL_STYLE}>Source</span>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 4 }}>
            {currentPost.source_type ? `${currentPost.source_type} \u00B7 ` : ''}{currentPost.source_title}
          </p>
          {currentPost.source_excerpt && (
            <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 6 }}>
              {currentPost.source_excerpt}
            </p>
          )}
          {currentPost.source_url && (
            <a href={currentPost.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--color-terracotta)', textDecoration: 'none' }}>
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
  date, isScheduled, isPublished, isScheduling, currentPost, images, publishing, publishError,
  approvalSending, onSchedule, onUnschedule, onSkip, onSendApproval, onDelete, onPublishNow,
}: {
  date: string; isScheduled: boolean; isPublished: boolean; isScheduling: boolean
  currentPost: CalendarPost; images: PostImage[]; publishing: boolean; publishError: string | null
  approvalSending?: boolean; onSchedule: () => void; onUnschedule: (id: string) => void
  onSkip: (id: string) => void; onSendApproval?: (id: string) => void; onDelete: (id: string) => void
  onPublishNow: () => void
}) {
  return (
    <div
      style={{
        padding: '14px 24px', borderTop: '0.5px solid rgba(44,62,80,0.07)',
        display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0,
      }}
    >
      <Button onClick={onSchedule} disabled={!date || isScheduling} loading={isScheduling} style={{ flex: 1 }}>
        {isScheduled ? 'Update schedule' : 'Schedule to calendar'}
      </Button>
      {isScheduled ? (
        <Button variant="secondary" onClick={() => onUnschedule(currentPost.id)}>Unschedule</Button>
      ) : (
        <Button variant="secondary" onClick={() => onSkip(currentPost.id)}>Skip for now</Button>
      )}
      {isScheduled && onSendApproval && (
        <Button variant="secondary" onClick={() => onSendApproval(currentPost.id)} disabled={approvalSending} loading={approvalSending}>
          <Mail style={{ width: 12, height: 12 }} /> Send for approval
        </Button>
      )}
      {images.length > 0 && !isPublished && currentPost.status !== 'publishing' && currentPost.platform === 'Instagram' && (
        <Button onClick={onPublishNow} disabled={publishing} loading={publishing}>Publish to Instagram</Button>
      )}
      <Button variant="danger" onClick={() => onDelete(currentPost.id)}>Delete post</Button>
      {publishError && (
        <div style={{ width: '100%', fontSize: 11, color: '#A32D2D', background: '#FCEBEB', padding: '8px 10px', borderRadius: 6 }}>
          {publishError}
        </div>
      )}
    </div>
  )
}
