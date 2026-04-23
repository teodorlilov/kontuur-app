'use client'

import { memo, useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Copy, Mail } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { decodeUrlsInText } from '@/utils/decode-url'
import { PLATFORMS } from '@/utils/constants'
import { CarouselSlides } from '@/components/posts/carousel-slides'
import { QualityScores } from '@/components/posts/quality-scores'
import { Button } from '@/components/ui/button'
import type {
  CalendarPost,
  CarouselSlide,
  ValidationCriteria,
  ValidationScores,
} from '@/types/api'

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
}: ScheduleCardProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [platform, setPlatform] = useState('')

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
  }, [post?.id, post?.platform, post?.scheduled_at])

  if (!isOpen || !post) return null

  // Capture for use in closures after null check
  const currentPost = post
  const isScheduled = currentPost.status === 'scheduled'
  const slides = Array.isArray(currentPost.slides_json) ? (currentPost.slides_json as CarouselSlide[]) : []
  const isCarousel = currentPost.post_type === 'carousel'
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
              bg={isScheduled ? 'var(--color-scheduled-bg)' : 'rgba(44,62,80,0.06)'}
              color={isScheduled ? 'var(--color-scheduled-fg)' : '#4A5060'}
            >
              {isScheduled ? 'Scheduled' : 'Unscheduled'}
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
            {/* Caption */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: 'var(--color-muted)',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
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
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-1)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(44,62,80,0.025)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  border: '0.5px solid var(--color-border-1)',
                }}
              >
                {currentPost.caption ? decodeUrlsInText(currentPost.caption) : 'No caption'}
              </div>
            </div>

            {/* Carousel slides */}
            {isCarousel && slides.length > 0 && (
              <div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: 'var(--color-muted)',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Carousel slides
                </span>
                <CarouselSlides slides={slides} />
              </div>
            )}

            {/* Schedule form */}
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label
                    htmlFor="card-date"
                    style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}
                  >
                    Date
                  </label>
                  <input
                    id="card-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    style={{
                      fontSize: 12,
                      border: '0.5px solid var(--color-border-2)',
                      borderRadius: 7,
                      padding: '7px 10px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      color: 'var(--color-text-1)',
                    }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label
                    htmlFor="card-time"
                    style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}
                  >
                    Time
                  </label>
                  <input
                    id="card-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    style={{
                      fontSize: 12,
                      border: '0.5px solid var(--color-border-2)',
                      borderRadius: 7,
                      padding: '7px 10px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      color: 'var(--color-text-1)',
                    }}
                  />
                </div>
              </div>

              {/* Platform selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>
                  Platform
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlatform(p)}
                      style={{
                        fontSize: 10,
                        padding: '5px 10px',
                        borderRadius: 5,
                        border: platform === p ? 'none' : '0.5px solid var(--color-border-2)',
                        background: platform === p ? 'var(--color-brand)' : '#fff',
                        color: platform === p ? '#ECE8E1' : 'var(--color-muted)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                        transition: 'all 0.15s',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: quality + source */}
          <div
            className="w-full md:w-[260px] border-t md:border-t-0 border-[rgba(44,62,80,0.07)] md:overflow-y-auto"
            style={{
              flexShrink: 0,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Overall score */}
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  color: 'var(--color-muted)',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Quality
              </span>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: score >= 9 ? '#5A8A4A' : score >= 7 ? '#C07B55' : '#B43232',
                }}
              >
                {score}
              </span>
            </div>

            {/* Detailed quality breakdown */}
            {validation && (
              <QualityScores criteria={validation.criteria} scores={validation.scores} />
            )}

            {/* Quality issues */}
            {validation?.criteria.issues && validation.criteria.issues.length > 0 && (
              <div
                style={{
                  background: 'rgba(192,123,85,0.08)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                {validation.criteria.issues.map((issue, i) => (
                  <p
                    key={i}
                    style={{
                      fontSize: 11,
                      color: '#C07B55',
                      lineHeight: 1.5,
                      marginBottom: i < validation.criteria.issues.length - 1 ? 6 : 0,
                    }}
                  >
                    &ldquo;{issue.description}&rdquo;
                  </p>
                ))}
              </div>
            )}

            {/* Source */}
            {currentPost.source_title && (
              <div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: 'var(--color-muted)',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Source
                </span>
                <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 4 }}>
                  {currentPost.source_type ? `${currentPost.source_type} \u00B7 ` : ''}
                  {currentPost.source_title}
                </p>
                {currentPost.source_excerpt && (
                  <p
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted)',
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: 6,
                    }}
                  >
                    {currentPost.source_excerpt}
                  </p>
                )}
                {currentPost.source_url && (
                  <a
                    href={currentPost.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: 'var(--color-terracotta)',
                      textDecoration: 'none',
                    }}
                  >
                    Verify on Google &rarr;
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card footer */}
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
          <Button
            onClick={handleSchedule}
            disabled={!date || isScheduling}
            loading={isScheduling}
            style={{ flex: 1 }}
          >
            {isScheduled ? 'Update schedule' : 'Schedule to calendar'}
          </Button>
          {isScheduled ? (
            <Button
              variant="secondary"
              onClick={() => onUnschedule(currentPost.id)}
            >
              Unschedule
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => onSkip(currentPost.id)}
            >
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
              <Mail style={{ width: 12, height: 12 }} />
              Send for approval
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => onDelete(currentPost.id)}
          >
            Delete post
          </Button>
        </div>
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
