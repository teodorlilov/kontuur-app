'use client'

import { memo } from 'react'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { CalendarPost } from '@/types/api'

interface UnscheduledPostItemProps {
  post: CalendarPost
  isActive: boolean
  onClick: () => void
}

/** Single row in the unscheduled slide panel. */
export const UnscheduledPostItem = memo(function UnscheduledPostItem({ post, isActive, onClick }: UnscheduledPostItemProps) {
  const pillarColor = post.pillar ? getPillarColor(post.pillar).hex : '#8A8070'
  const score = post.quality_score_avg ?? 0

  return (
    <div
      onClick={onClick}
      style={{
        padding: '11px 18px',
        borderBottom: '0.5px solid rgba(44,62,80,0.055)',
        cursor: 'pointer',
        background: isActive ? 'rgba(44,62,80,0.035)' : 'transparent',
        position: 'relative',
        transition: 'background 0.12s',
      }}
    >
      {/* Active indicator */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '15%',
            bottom: '15%',
            width: 2.5,
            background: 'var(--color-terracotta)',
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}

      {/* Row 1: client + priority + score */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 3,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: pillarColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-1)' }}>
            {post.client_name}
          </span>
          {post.priority && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 9,
                fontWeight: 500,
                padding: '1px 6px',
                borderRadius: 3,
                background: 'rgba(192,123,85,0.14)',
                color: 'var(--color-terracotta)',
              }}
            >
              Priority
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: score >= 9 ? '#5A8A4A' : score >= 7 ? '#C07B55' : '#B43232',
          }}
        >
          {score}/10
        </span>
      </div>

      {/* Row 2: pillar + type */}
      <div style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 4 }}>
        {post.pillar ?? 'No pillar'}
        {' · '}
        {post.post_type === 'carousel'
          ? `Carousel · ${Array.isArray(post.slides_json) ? post.slides_json.length : 0} slides`
          : 'Single image'}
      </div>

      {/* Row 3: caption preview */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-muted)',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginBottom: 6,
        }}
      >
        {post.caption ?? 'No caption'}
      </div>

      {/* Row 4: platform tag + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {post.platform && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 3,
              background: 'rgba(192,123,85,0.12)',
              color: 'var(--color-terracotta)',
            }}
          >
            {post.platform}
          </span>
        )}
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 3,
            background: 'rgba(44,62,80,0.06)',
            color: '#4A5060',
          }}
        >
          {post.post_type === 'carousel' ? 'Carousel' : 'Single'}
        </span>
        <span style={{ fontSize: 10, color: '#C0B8B0', marginLeft: 'auto' }}>
          {timeAgo(post.created_at)}
        </span>
      </div>
    </div>
  )
})

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Yesterday'
  if (diffD < 7) return `${diffD}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
