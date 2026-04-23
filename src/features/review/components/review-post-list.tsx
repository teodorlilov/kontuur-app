'use client'

import { cn } from '@/utils/cn'
import { formatRelativeTime } from '@/utils/format'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { Button } from '@/components/ui/button'
import { ActiveBar, ScoreLabel } from '@/components/posts/post-list-parts'
import type { ReviewPost, ReviewTab } from '@/lib/review/filter-review-posts'

interface ReviewPostListProps {
  posts: ReviewPost[]
  allPosts: ReviewPost[]
  clients: Array<{ id: string; name: string; is_health_niche: boolean }>
  selectedPostId: string | null
  activeTab: ReviewTab
  selectedClientId: string | null
  approvedCount: number
  onSelectPost: (id: string) => void
  onTabChange: (tab: ReviewTab) => void
  onClientChange: (clientId: string | null) => void
  onOpenBatch: () => void
}

const tabs: Array<{ key: ReviewTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'priority', label: 'Priority' },
  { key: 'health', label: 'Health review' },
]

/** Left panel: filter tabs, client dropdown, and scrollable post list. */
export function ReviewPostList({
  posts,
  allPosts,
  clients,
  selectedPostId,
  activeTab,
  selectedClientId,
  approvedCount,
  onSelectPost,
  onTabChange,
  onClientChange,
  onOpenBatch,
}: ReviewPostListProps) {
  const priorityCount = allPosts.filter((p) => p.priority).length
  const healthCount = allPosts.filter((p) => p.is_health_niche).length

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
      {/* Tabs */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'rgba(44,62,80,0.04)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-colors flex-1',
                activeTab === tab.key
                  ? 'bg-white shadow-sm'
                  : 'hover:bg-white/50'
              )}
              style={{
                color: activeTab === tab.key ? 'var(--color-text-1)' : 'var(--color-muted)',
              }}
            >
              {tab.label}
              {tab.key === 'priority' && priorityCount > 0 && (
                <span className="ml-1 bg-red-100 text-red-700 px-1 py-0.5 rounded-full text-[9px] font-semibold">
                  {priorityCount}
                </span>
              )}
              {tab.key === 'health' && healthCount > 0 && (
                <span className="ml-1 bg-amber-100 text-amber-700 px-1 py-0.5 rounded-full text-[9px] font-semibold">
                  {healthCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Client filter */}
        {clients.length > 1 && (
          <select
            value={selectedClientId ?? ''}
            onChange={(e) => onClientChange(e.target.value || null)}
            className="w-full mt-2 text-[11px] border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-border-3)]"
            style={{
              borderColor: 'var(--color-border-1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-1)',
            }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '0.5px solid var(--color-border-1)',
          }}
        >
          <span style={{ fontSize: '10px', color: 'var(--color-muted)' }}>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            {approvedCount > 0 && ` \u00b7 ${approvedCount} approved`}
          </span>
          {approvedCount > 0 && (
            <Button onClick={onOpenBatch} size="sm" variant="secondary" className="text-[10px] px-2 py-0.5 h-auto">
              Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable post list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {posts.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-muted)' }}>No posts to review</p>
            <p style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px', opacity: 0.7 }}>
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
        borderBottom: '0.5px solid rgba(44,62,80,0.055)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        background: isActive ? 'rgba(44,62,80,0.035)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      {isActive && <ActiveBar />}

      {/* Pillar + score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-1)' }}>
          {pillarColor && (
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: pillarColor.hex, flexShrink: 0 }} />
          )}
          {post.pillar ?? 'General'}
        </div>
        {post.quality_score_avg !== null && <ScoreLabel score={post.quality_score_avg} />}
      </div>

      {/* Client name */}
      <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginBottom: '5px' }}>
        {post.client_name}
      </div>

      {/* Caption preview */}
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
        {post.caption ?? ''}
      </div>

      {/* Status + time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusBadge post={post} />
        <span style={{ fontSize: '10px', color: 'var(--color-muted)', opacity: 0.7 }}>
          {formatRelativeTime(new Date(post.created_at))}
        </span>
      </div>
    </div>
  )
}

function StatusBadge({ post }: { post: ReviewPost }) {
  const config = post.priority
    ? { bg: 'rgba(192,123,85,0.10)', color: 'var(--color-terracotta)', label: 'Priority', icon: '\u25b8' }
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
