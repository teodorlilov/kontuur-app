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
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-r border-ink/10 bg-surface">
      {/* Filter bar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-ink/10 px-4">
        {FILTERS.map((f) => (
          <button
            className="cursor-pointer rounded-[6px] border-0 px-2.5 py-[5px] text-micro font-medium transition-all duration-150 ease-[ease]"
            key={f}
            onClick={() => onFilterChange(f)}
            style={{
              background: activeFilter === f ? 'var(--forest-deep)' : 'transparent',
              color: activeFilter === f ? 'var(--ink-inv)' : 'var(--text2)',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <span className="ml-auto text-micro text-text2">{filtered.length} posts</span>
      </div>

      {/* Post header */}
      {/* tracking-[1.5px]: the Label role carries 0.16em, which lands at 1.6px on
          its 10px step — this header was drawn a hair tighter than that. */}
      <div className="flex shrink-0 items-center justify-between border-b border-ink/7 px-4 py-2.5 text-label font-medium uppercase tracking-[1.5px] text-text2">
        <span>Posts</span>
        <span>{posts.length} total</span>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
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
          <div className="px-5 py-10 text-center text-caption italic text-text2">
            No posts match this filter
          </div>
        )}
      </div>
    </div>
  )
}
