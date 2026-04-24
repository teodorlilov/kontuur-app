'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle, Pencil, AlertTriangle } from 'lucide-react'
import { formatRelativeTime, parseTimestamp, truncateText, formatScheduleDate } from '@/utils/format'
import { extractFlaggedSlide } from '@/utils/extract-flagged-slides'
import type { DashboardChangeRequest } from '@/types/api'

type Platform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok'

const PLATFORM_FULL: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
}

const PLATFORM_STYLE: Record<Platform, { bg: string; color: string }> = {
  instagram: { bg: 'rgba(192,123,85,0.10)', color: 'var(--color-terracotta)' },
  facebook: { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
  linkedin: { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
  tiktok: { bg: 'rgba(44,62,80,0.10)', color: '#2C3E50' },
}

/** Build post type label — "Carousel · N slides" or "Single image". */
function buildPostTypeLabel(postType: string, slideCount: number): string {
  if (postType === 'carousel') return `Carousel · ${slideCount} slides`
  return 'Single image'
}

/** Header row: client name · Post #N · scheduled date + badges + time. */
function CardHeader({ cr }: { cr: DashboardChangeRequest }) {
  const platform = (cr.platform ?? 'instagram') as Platform
  const pStyle = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.instagram
  const slideCount = cr.slidesJson?.length ?? 0
  const typeLabel = buildPostTypeLabel(cr.postType, slideCount)
  const scheduledLabel = cr.scheduledAt ? formatScheduleDate(parseTimestamp(cr.scheduledAt)) : ''
  const timeAgo = cr.respondedAt ? formatRelativeTime(parseTimestamp(cr.respondedAt)) : ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2630' }}>{cr.clientName}</span>
      <span style={{ fontSize: 12, color: '#8A8070' }}>·</span>
      <span style={{ fontSize: 12, color: '#8A8070' }}>Post #{cr.postNumber}</span>
      <span style={{ fontSize: 12, color: '#8A8070' }}>·</span>
      <span style={{ fontSize: 12, color: '#8A8070' }}>{scheduledLabel}</span>

      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: pStyle.color,
          background: pStyle.bg,
          padding: '2px 8px',
          borderRadius: 4,
          marginLeft: 4,
        }}
      >
        {PLATFORM_FULL[platform] ?? platform}
      </span>

      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#5A6B7A',
          background: 'rgba(44,62,80,0.06)',
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        {typeLabel}
      </span>

      <span style={{ fontSize: 11, color: '#B0A898', marginLeft: 'auto', flexShrink: 0 }}>
        {timeAgo}
      </span>
    </div>
  )
}

/** Feedback quote block with speech bubble icon. */
function FeedbackQuote({ note }: { note: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        background: 'rgba(192,123,85,0.04)',
        border: '0.5px solid rgba(192,123,85,0.12)',
        borderRadius: 8,
        padding: '10px 12px',
        marginTop: 8,
      }}
    >
      <MessageCircle size={14} color="#8A8070" style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ fontSize: 13, color: '#1A2630', fontStyle: 'italic', lineHeight: 1.5, margin: 0 }}>
        &ldquo;{note}&rdquo;
      </p>
    </div>
  )
}

/** Single change request card for the dashboard section. */
export function ChangeRequestCard({ changeRequest: cr }: { changeRequest: DashboardChangeRequest }) {
  const router = useRouter()
  const flaggedSlide = extractFlaggedSlide(cr.clientNote)

  return (
    <div
      style={{
        border: '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: 10,
        padding: '14px 16px',
        background: '#fff',
      }}
    >
      <CardHeader cr={cr} />

      {cr.caption && (
        <p style={{ fontSize: 13, color: '#1A2630', lineHeight: 1.45, margin: '0 0 4px' }}>
          {truncateText(cr.caption, 120)}
        </p>
      )}

      {cr.clientNote && <FeedbackQuote note={cr.clientNote} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <button
          onClick={() => router.push(`/calendar?editPost=${cr.id}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: '#fff',
            background: '#1A2630',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Pencil size={12} />
          Edit post
        </button>

        {flaggedSlide && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-terracotta)',
              background: 'rgba(192,123,85,0.08)',
              padding: '3px 10px',
              borderRadius: 4,
            }}
          >
            <AlertTriangle size={11} />
            Slide {flaggedSlide} flagged
          </span>
        )}
      </div>
    </div>
  )
}
