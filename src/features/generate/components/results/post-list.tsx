'use client'

import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { PostData, ValidationData } from '@/components/posts/post-card'

type GeneratedPost = { post: PostData } & ValidationData

interface PostListProps {
  posts: GeneratedPost[]
  selectedPostId: string
  onSelect: (id: string) => void
}

/** Left panel: scrollable list of generated posts. */
export function PostList({ posts, selectedPostId, onSelect }: PostListProps) {
  return (
    <div
      style={{
        width: '280px',
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
            score={item.quality.quality_score_avg}
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
  isActive,
  onClick,
}: {
  post: PostData
  score: number
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
      <PillarRow pillar={post.pillar} pillarHex={pillarColor?.hex} score={score} />
      <CaptionPreview caption={post.caption} />
      <StatusBadge status={post.status} />
    </div>
  )
}

function ActiveBar() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: '10%',
        bottom: '10%',
        width: '2.5px',
        background: 'var(--color-terracotta)',
        borderRadius: '0 3px 3px 0',
      }}
    />
  )
}

function PillarRow({ pillar, pillarHex, score }: { pillar?: string | null; pillarHex?: string; score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-1)' }}>
        {pillarHex && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: pillarHex, flexShrink: 0 }} />}
        {pillar ?? 'General'}
      </div>
      <ScoreLabel score={score} />
    </div>
  )
}

function ScoreLabel({ score }: { score: number }) {
  const color = score >= 9 ? 'var(--status-ok)' : score >= 7 ? 'var(--color-terracotta)' : '#E05A3A'
  return <span style={{ fontSize: '11px', fontWeight: 500, color }}>{score}/10</span>
}

function CaptionPreview({ caption }: { caption: string | null }) {
  return (
    <div
      style={{
        fontSize: '11px',
        color: 'var(--color-muted)',
        lineHeight: 1.45,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        marginBottom: '7px',
      }}
    >
      {caption ?? ''}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config =
    status === 'approved'
      ? { bg: 'rgba(90,138,74,0.10)', color: 'var(--status-ok)', label: 'Approved', icon: '✓' }
      : status === 'discarded'
        ? { bg: 'rgba(192,123,85,0.10)', color: 'var(--color-terracotta)', label: 'Discarded', icon: '✕' }
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
