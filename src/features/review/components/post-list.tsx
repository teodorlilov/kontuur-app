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
        borderRight: '0.5px solid rgba(44,62,80,0.10)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Filter bar */}
      <div
        style={{
          borderBottom: '0.5px solid rgba(44,62,80,0.10)',
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
            key={f}
            onClick={() => onFilterChange(f)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              background: activeFilter === f ? '#1A2630' : 'transparent',
              color: activeFilter === f ? '#ECE8E1' : '#8A8070',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8A8070' }}>
          {filtered.length} posts
        </span>
      </div>

      {/* Post header */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '0.5px solid rgba(44,62,80,0.07)',
          fontSize: 9,
          fontWeight: 500,
          color: '#8A8070',
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
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              fontSize: 12,
              color: '#8A8070',
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
