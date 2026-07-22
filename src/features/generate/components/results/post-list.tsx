'use client'

import { Image as ImageIcon } from 'lucide-react'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { ActiveBar, ScoreLabel, CaptionPreview } from '@/components/posts/post-list-parts'
import type { DraftVisual } from '@/features/generate/lib/draft-visuals'
import type { PostData, ValidationData } from '@/types/post'

type GeneratedPost = { post: PostData } & ValidationData

interface PostListProps {
  posts: GeneratedPost[]
  selectedPostId: string
  visualsByPost: Record<string, DraftVisual[]>
  onSelect: (id: string) => void
}

/** Left panel: scrollable list of generated posts. */
export function PostList({ posts, selectedPostId, visualsByPost, onSelect }: PostListProps) {
  return (
    <div
      className="w-full md:w-[280px]"
      style={{
        flexShrink: 0,
        background: 'var(--color-surface)',
        borderRight: '0.5px solid var(--color-border-1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <ListHeader count={posts.length} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {posts.map((item) => (
          <PostListItem
            key={item.post.id}
            post={item.post}
            score={item.scores.overall_score}
            visuals={visualsByPost[item.post.id]}
            isActive={item.post.id === selectedPostId}
            onClick={() => onSelect(item.post.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ListHeader({ count }: { count: number }) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '0.5px solid var(--color-border-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--color-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        Posts
      </span>
      <span style={{ fontSize: '10px', color: 'var(--color-muted)' }}>{count} generated</span>
    </div>
  )
}

function PostListItem({
  post,
  score,
  visuals,
  isActive,
  onClick,
}: {
  post: PostData
  score: number
  visuals: DraftVisual[] | undefined
  isActive: boolean
  onClick: () => void
}) {
  const pillarColor = post.pillar ? getPillarColor(post.pillar) : null

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '0.5px solid rgba(44,62,80,0.055)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        background: isActive ? 'rgba(44,62,80,0.035)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      {isActive && <ActiveBar />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-1)' }}>
          {pillarColor && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: pillarColor.hex, flexShrink: 0 }} />}
          {post.pillar ?? 'General'}
        </div>
        <ScoreLabel score={score} />
      </div>
      <CaptionPreview caption={post.caption} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <StatusBadge status={post.status} />
        <VisualsCounter visuals={visuals} />
      </div>
    </div>
  )
}

/** "N/M" per-post visuals progress while drafts stream in. */
function VisualsCounter({ visuals }: { visuals: DraftVisual[] | undefined }) {
  if (!visuals || visuals.length === 0) return null
  const done = visuals.filter((v) => v.status === 'done').length
  const complete = done === visuals.length
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '10px',
        fontWeight: 500,
        padding: '3px 7px',
        borderRadius: '4px',
        background: complete ? 'rgba(90,138,74,0.10)' : 'rgba(192,123,85,0.08)',
        color: complete ? 'var(--status-ok)' : '#C07B55',
      }}
    >
      <ImageIcon style={{ width: 10, height: 10 }} />
      {done}/{visuals.length}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config =
    status === 'approved'
      ? { bg: 'rgba(90,138,74,0.10)', color: 'var(--status-ok)', label: 'Approved', icon: '\u2713' }
      : status === 'discarded'
        ? { bg: 'rgba(192,123,85,0.10)', color: 'var(--color-terracotta)', label: 'Discarded', icon: '\u2715' }
        : { bg: 'rgba(44,62,80,0.06)', color: 'var(--color-muted)', label: 'Pending review', icon: null }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10px',
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
