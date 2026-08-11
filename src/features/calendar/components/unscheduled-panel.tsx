'use client'

import { memo, useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import { UnscheduledPostItem } from './unscheduled-post-item'
import type { CalendarPost } from '@/types/api'

type PanelSort = 'score' | 'client' | 'newest' | 'pillar'

interface UnscheduledPanelProps {
  posts: CalendarPost[]
  isOpen: boolean
  activePostId: string | null
  onPostClick: (post: CalendarPost) => void
  onClose: () => void
}

/** 360px slide-from-right panel listing unscheduled posts. */
export const UnscheduledPanel = memo(function UnscheduledPanel({
  posts,
  isOpen,
  activePostId,
  onPostClick,
  onClose,
}: UnscheduledPanelProps) {
  const [search, setSearch] = useState('')
  const [showPriorityOnly, setShowPriorityOnly] = useState(false)
  const [sort, setSort] = useState<PanelSort>('score')

  const filtered = useMemo(() => {
    let result = [...posts]
    if (showPriorityOnly) result = result.filter((p) => p.priority)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.client_name.toLowerCase().includes(q) ||
          (p.caption ?? '').toLowerCase().includes(q) ||
          (p.pillar ?? '').toLowerCase().includes(q)
      )
    }
    switch (sort) {
      case 'score':
        // Unscored rows sort last rather than as zeros — a post nobody judged
        // has not earned last place. They then leave the ranked sections for a
        // labelled group below, so an absence never reads as a rank.
        result.sort((a, b) => {
          if (a.quality_score_avg === null && b.quality_score_avg === null) return 0
          if (a.quality_score_avg === null) return 1
          if (b.quality_score_avg === null) return -1
          return b.quality_score_avg - a.quality_score_avg
        })
        break
      case 'client':
        result.sort((a, b) => a.client_name.localeCompare(b.client_name))
        break
      case 'newest':
        result.sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
      case 'pillar':
        result.sort((a, b) => (a.pillar ?? '').localeCompare(b.pillar ?? ''))
        break
    }
    return result
  }, [posts, showPriorityOnly, search, sort])

  const unscoredPosts = sort === 'score' ? filtered.filter((p) => p.quality_score_avg === null) : []
  const rankedPosts = sort === 'score' ? filtered.filter((p) => p.quality_score_avg !== null) : filtered
  const priorityPosts = rankedPosts.filter((p) => p.priority)
  const regularPosts = rankedPosts.filter((p) => !p.priority)

  return (
    <div
      className="absolute bottom-0 right-0 top-0 z-[15] flex w-full max-w-[360px] flex-col border-l border-line bg-surface shadow-[-6px_0_30px_rgba(15,21,18,0.12)]"
      // Stays a transform: Tailwind's translate-* utilities write the `translate`
      // property, which this `transition: transform` would no longer animate.
      style={{
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-ink/[0.07] px-[18px] pb-3 pt-4">
        {/* Title row */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-body font-medium text-ink">
            Ready to schedule
            <span className="rounded-[5px] bg-spring/[0.12] px-2 py-0.5 text-micro font-medium text-spring-text">
              {posts.length} posts
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-6 cursor-pointer items-center justify-center rounded-xs border-none bg-transparent text-text2"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-[6px] border border-line2 bg-surface px-2 py-[5px]">
            <Search className="size-3 shrink-0 text-text2" />
            <input
              className="w-full border-none bg-transparent text-lead text-ink md:text-micro"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..."
              // outline-none would let the global :focus-visible ring through —
              // that rule is unlayered and outranks any utility.
              style={{ outline: 'none' }}
            />
          </div>
          <FilterBtn
            label="All"
            active={!showPriorityOnly}
            onClick={() => setShowPriorityOnly(false)}
          />
          <FilterBtn
            label="Priority"
            active={showPriorityOnly}
            onClick={() => setShowPriorityOnly(true)}
          />
        </div>
      </div>

      {/* Sort row */}
      <div className="flex shrink-0 items-center justify-between px-[18px] pt-[7px]">
        <span className="text-label font-semibold uppercase text-text2">
          {filtered.length} posts
        </span>
        {/* md:tracking-normal cancels the Label role's built-in 0.16em once the
            control drops to that size. */}
        <select
          className="cursor-pointer border-none bg-transparent text-lead text-text2 md:text-label md:tracking-normal"
          value={sort}
          onChange={(e) => setSort(e.target.value as PanelSort)}
          // outline-none would let the global :focus-visible ring through —
          // that rule is unlayered and outranks any utility.
          style={{ outline: 'none' }}
        >
          <option value="score">Sort: Quality score</option>
          <option value="client">Sort: Client</option>
          <option value="newest">Sort: Newest</option>
          <option value="pillar">Sort: Pillar</option>
        </select>
      </div>

      {/* Scrollable post list */}
      <div className="flex-1 overflow-y-auto">
        {priorityPosts.length > 0 && (
          <>
            <SectionLabel label={`Priority \u2014 ${priorityPosts.length} posts`} />
            {priorityPosts.map((post) => (
              <UnscheduledPostItem
                key={post.id}
                post={post}
                isActive={post.id === activePostId}
                onClick={() => onPostClick(post)}
              />
            ))}
          </>
        )}
        {regularPosts.length > 0 && (
          <>
            <SectionLabel label={`Regular \u2014 ${regularPosts.length} posts`} />
            {regularPosts.map((post) => (
              <UnscheduledPostItem
                key={post.id}
                post={post}
                isActive={post.id === activePostId}
                onClick={() => onPostClick(post)}
              />
            ))}
          </>
        )}
        {unscoredPosts.length > 0 && (
          <>
            <SectionLabel label={`Not scored \u2014 ${unscoredPosts.length} posts`} />
            {unscoredPosts.map((post) => (
              <UnscheduledPostItem
                key={post.id}
                post={post}
                isActive={post.id === activePostId}
                onClick={() => onPostClick(post)}
              />
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-body italic text-text2">
            {search ? `No posts match \u201C${search}\u201D` : 'No posts to schedule'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-center border-t border-ink/[0.07] bg-sunken px-[18px] py-3">
        <span className="text-micro text-text2">Select a post to schedule it</span>
      </div>
    </div>
  )
})

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-b border-ink/[0.07] bg-sunken px-[18px] pb-1 pt-2 text-label font-semibold uppercase text-text2">
      {label}
    </div>
  )
}

function FilterBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    // tracking-normal cancels the Label role's built-in 0.16em.
    <button
      className={cn(
        'cursor-pointer whitespace-nowrap rounded-[5px] px-2.5 py-[5px] text-label font-medium tracking-normal',
        active ? 'border-none bg-forest text-ink-inv' : 'border border-line2 bg-surface text-text2'
      )}
      type="button"
      onClick={onClick}
      // `all 0.15s` rides the default `ease`; Tailwind's transition-* would
      // swap in its own curve.
      style={{ transition: 'all 0.15s' }}
    >
      {label}
    </button>
  )
}
