'use client'

import { Clock, Check, MessageCircle } from 'lucide-react'
import { ActiveBar, CaptionPreview } from '@/components/posts/post-list-parts'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { formatScheduleDate } from '@/utils/format'
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
      className="text-label tracking-normal"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
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
  const date = post.scheduled_at ? formatScheduleDate(new Date(post.scheduled_at)) : null
  const pillar = post.pillar ? getPillarColor(post.pillar) : null

  return (
    <div
      onClick={onClick}
      style={{
        padding: '13px 16px',
        borderBottom: '1px solid rgba(15,21,18,0.055)',
        cursor: 'pointer',
        background: isActive ? 'rgba(15,21,18,0.035)' : 'transparent',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--sunken)'
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
        <span
          className="text-label tracking-normal"
          style={{ fontWeight: 500, color: 'var(--text2)' }}
        >
          #{index}
        </span>
        {date && (
          <span className="text-label tracking-normal" style={{ color: 'var(--text2)' }}>
            {date}
          </span>
        )}
        {post.platform && (
          <span
            className="text-label tracking-normal"
            style={{
              fontWeight: 500,
              padding: '1px 7px',
              borderRadius: 3,
              background: 'rgba(46,158,104,0.12)',
              color: 'var(--spring-text)',
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
            className="text-micro"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500,
              color: 'var(--ink)',
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
        <span className="text-label tracking-normal" style={{ color: 'var(--text2)' }}>
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
