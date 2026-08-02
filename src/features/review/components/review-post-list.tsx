'use client'

import { Image as ImageIcon } from 'lucide-react'
import { formatRelativeTime } from '@/utils/format'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { Button } from '@/components/ui/button'
import { ActiveBar, ScoreLabel } from '@/components/posts/post-list-parts'
import { parseSlides } from '@/components/posts/parse-slides'
import type { ReviewPost } from '@/features/review/lib/filter-review-posts'

interface ReviewPostListProps {
  posts: ReviewPost[]
  selectedPostId: string | null
  approvedCount: number
  onSelectPost: (id: string) => void
  onOpenBatch: () => void
}

/**
 * Left panel: the scrollable post list.
 *
 * Filtering and client scoping live in the page header, not here: they narrow
 * the whole page, and a list column is not where a page-level control belongs.
 */
export function ReviewPostList({
  posts,
  selectedPostId,
  approvedCount,
  onSelectPost,
  onOpenBatch,
}: ReviewPostListProps) {
  return (
    <div
      className="w-full md:w-[280px]"
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span className="text-label tracking-normal" style={{ color: 'var(--text2)' }}>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            {approvedCount > 0 && ` \u00b7 ${approvedCount} approved`}
          </span>
          {approvedCount > 0 && (
            <Button
              onClick={onOpenBatch}
              size="sm"
              variant="secondary"
              className="text-label px-2 py-0.5 h-auto"
            >
              Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable post list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {posts.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p className="text-caption" style={{ fontWeight: 500, color: 'var(--text2)' }}>
              No posts to review
            </p>
            <p
              className="text-micro"
              style={{ color: 'var(--text2)', marginTop: '4px', opacity: 0.7 }}
            >
              Posts appear here when generation is enabled.
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <ReviewPostListItem
              key={post.id}
              post={post}
              isActive={post.id === selectedPostId}
              onClick={() => onSelectPost(post.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ReviewPostListItem({
  post,
  isActive,
  onClick,
}: {
  post: ReviewPost
  isActive: boolean
  onClick: () => void
}) {
  const pillarColor = post.pillar ? getPillarColor(post.pillar) : null

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(15,21,18,0.055)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        background: isActive ? 'rgba(15,21,18,0.035)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      {isActive && <ActiveBar />}

      {/* Pillar + score */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2px',
        }}
      >
        <div
          className="text-micro"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          {pillarColor && (
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: pillarColor.hex,
                flexShrink: 0,
              }}
            />
          )}
          {post.pillar ?? 'General'}
        </div>
        {post.quality_score_avg !== null && <ScoreLabel score={post.quality_score_avg} />}
      </div>

      {/* Client name */}
      <div
        className="text-label tracking-normal"
        style={{ color: 'var(--text2)', marginBottom: '5px' }}
      >
        {post.client_name}
      </div>

      {/* Caption preview */}
      <div
        className="text-micro"
        style={{
          color: 'var(--text2)',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginBottom: '7px',
        }}
      >
        {post.caption ?? ''}
      </div>

      {/* Status + time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <StatusBadge post={post} />
          <VisualsBadge post={post} />
        </div>
        <span
          className="text-label tracking-normal"
          style={{ color: 'var(--text2)', opacity: 0.7 }}
        >
          {formatRelativeTime(new Date(post.created_at))}
        </span>
      </div>
    </div>
  )
}

/** "N/M" visuals counter so it's obvious which pending posts still need images. */
function VisualsBadge({ post }: { post: ReviewPost }) {
  const totalSlots = post.post_type === 'carousel' ? parseSlides(post.slides_json).length : 1
  if (totalSlots === 0) return null
  const complete = post.images.length >= totalSlots
  return (
    <span
      className="text-label tracking-normal"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontWeight: 500,
        padding: '3px 7px',
        borderRadius: '4px',
        background: complete ? 'var(--wash)' : 'var(--sunken)',
        color: complete ? 'var(--forest)' : 'var(--text2)',
      }}
    >
      <ImageIcon style={{ width: 10, height: 10 }} />
      {post.images.length}/{totalSlots}
    </span>
  )
}

function StatusBadge({ post }: { post: ReviewPost }) {
  // Priority takes Amber (the exception); the default waiting state stays
  // neutral, so a queue of pending posts does not read as a wall of warnings.
  const config = post.priority
    ? { bg: 'var(--pending-bg)', color: 'var(--pending)', label: 'Priority', icon: '\u25b8' }
    : { bg: 'var(--sunken)', color: 'var(--text2)', label: 'Pending review', icon: null }

  return (
    <span
      className="text-label tracking-normal"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: '4px',
        background: config.bg,
        color: config.color,
      }}
    >
      {config.icon && <span>{config.icon}</span>}
      {config.label}
    </span>
  )
}
