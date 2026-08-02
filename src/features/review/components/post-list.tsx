'use client'

import type { ApprovalPostData } from '@/types/api'
import { PostListItem } from './post-list-item'
import type { ApprovalPostStatus, ApprovalFilter } from './types'

const FILTER_LABELS: Record<ApprovalFilter, string> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  changes_requested: 'Feedback sent',
}

const FILTERS: ApprovalFilter[] = ['all', 'pending', 'approved', 'changes_requested']

interface PostListProps {
  posts: ApprovalPostData[]
  postStatuses: Map<string, ApprovalPostStatus>
  selectedPostId: string | null
  activeFilter: ApprovalFilter
  onSelectPost: (id: string) => void
  onFilterChange: (tab: ApprovalFilter) => void
}

/** Filter posts by the active tab. */
function filterPosts(
  posts: ApprovalPostData[],
  statuses: Map<string, ApprovalPostStatus>,
  filter: ApprovalFilter
): ApprovalPostData[] {
  if (filter === 'all') return posts
  return posts.filter((p) => statuses.get(p.id) === filter)
}

/** Left-panel scrollable post list with filter tabs. */
export function PostList({
  posts,
  postStatuses,
  selectedPostId,
  activeFilter,
  onSelectPost,
  onFilterChange,
}: PostListProps) {
  const filtered = filterPosts(posts, postStatuses, activeFilter)

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid rgba(15,21,18,0.10)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Filter bar */}
      <div
        style={{
          borderBottom: '1px solid rgba(15,21,18,0.10)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 4,
          height: 40,
          flexShrink: 0,
        }}
      >
        {FILTERS.map((f) => (
          <button
            className="text-micro"
            key={f}
            onClick={() => onFilterChange(f)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              background: activeFilter === f ? 'var(--forest-deep)' : 'transparent',
              color: activeFilter === f ? '#f2f5f1' : 'var(--text2)',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <span className="text-micro" style={{ marginLeft: 'auto', color: 'var(--text2)' }}>
          {filtered.length} posts
        </span>
      </div>

      {/* Post header */}
      <div
        className="text-label"
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(15,21,18,0.07)',
          fontWeight: 500,
          color: 'var(--text2)',
          letterSpacing: '1.5px',
          textTransform: 'uppercase' as const,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span>Posts</span>
        <span>{posts.length} total</span>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map((post, i) => (
          <PostListItem
            key={post.id}
            post={post}
            index={i + 1}
            status={postStatuses.get(post.id) ?? 'pending'}
            isActive={post.id === selectedPostId}
            onClick={() => onSelectPost(post.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div
            className="text-caption"
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text2)',
              fontStyle: 'italic',
            }}
          >
            No posts match this filter
          </div>
        )}
      </div>
    </div>
  )
}
