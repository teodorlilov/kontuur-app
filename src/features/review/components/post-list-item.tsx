'use client'

import { Clock, Check, MessageCircle } from 'lucide-react'
import { ActiveBar, CaptionPreview } from '@/components/posts/post-list-parts'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { ApprovalPostData, CarouselSlide } from '@/types/api'
import { APPROVAL_STATUS_STYLES, type ApprovalPostStatus } from './types'

interface PostListItemProps {
  post: ApprovalPostData
  index: number
  status: ApprovalPostStatus
  isActive: boolean
  onClick: () => void
}

/** Format scheduled_at into a short date like "Sat, Apr 25". */
function formatShortDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Build a human-readable post type label. */
function postTypeLabel(postType: string, slides: unknown): string {
  if (postType === 'carousel') {
    const count = Array.isArray(slides) ? slides.length : 0
    return `Carousel · ${count} slides`
  }
  return 'Single image'
}

/** Small status badge showing pending / approved / feedback sent. */
function ApprovalStatusBadge({ status }: { status: ApprovalPostStatus }) {
  const s = APPROVAL_STATUS_STYLES[status]
  const Icon = status === 'pending' ? Clock : status === 'approved' ? Check : MessageCircle
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: 4,
        background: s.bg,
        color: s.color,
      }}
    >
      <Icon size={9} />
      {s.label}
    </div>
  )
}

/** Single post row in the left-panel list. */
export function PostListItem({ post, index, status, isActive, onClick }: PostListItemProps) {
  const date = formatShortDate(post.scheduled_at)
  const pillar = post.pillar ? getPillarColor(post.pillar) : null

  return (
    <div
      onClick={onClick}
      style={{
        padding: '13px 16px',
        borderBottom: '0.5px solid rgba(44,62,80,0.055)',
        cursor: 'pointer',
        background: isActive ? 'rgba(44,62,80,0.035)' : 'transparent',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = '#F9F6F2'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      {isActive && <ActiveBar />}

      {/* Row 1: number · date · platform */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 500, color: '#8A8070' }}>#{index}</span>
        {date && <span style={{ fontSize: 10, color: '#8A8070' }}>{date}</span>}
        {post.platform && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 7px',
              borderRadius: 3,
              background: 'rgba(192,123,85,0.12)',
              color: '#C07B55',
            }}
          >
            {post.platform}
          </span>
        )}
      </div>

      {/* Row 2: pillar + type */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          marginBottom: 5,
          flexWrap: 'wrap',
        }}
      >
        {post.pillar && pillar && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 500,
              color: '#1A2630',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: pillar.hex,
                flexShrink: 0,
              }}
            />
            {post.pillar}
          </div>
        )}
        <span style={{ fontSize: 10, color: '#8A8070' }}>
          · {postTypeLabel(post.post_type, post.slides_json)}
        </span>
      </div>

      {/* Row 3: caption preview */}
      <CaptionPreview caption={post.caption} />

      {/* Row 4: status badge */}
      <ApprovalStatusBadge status={status} />
    </div>
  )
}
