'use client'

import { memo, useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
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
        result.sort((a, b) => (b.quality_score_avg ?? 0) - (a.quality_score_avg ?? 0))
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

  const priorityPosts = filtered.filter((p) => p.priority)
  const regularPosts = filtered.filter((p) => !p.priority)

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: '#fff',
        borderLeft: '0.5px solid var(--color-border-1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 15,
        boxShadow: '-6px 0 30px rgba(44,62,80,0.12)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 18px 12px',
          borderBottom: '0.5px solid rgba(44,62,80,0.07)',
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-text-1)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Ready to schedule
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--color-terracotta)',
                background: 'rgba(192,123,85,0.12)',
                padding: '2px 8px',
                borderRadius: 5,
              }}
            >
              {posts.length} posts
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-muted)',
              borderRadius: 4,
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              border: '0.5px solid var(--color-border-2)',
              borderRadius: 6,
              background: '#fff',
            }}
          >
            <Search style={{ width: 12, height: 12, color: 'var(--color-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..."
              style={{
                border: 'none',
                outline: 'none',
                fontSize: 11,
                color: 'var(--color-text-1)',
                background: 'transparent',
                width: '100%',
                fontFamily: 'inherit',
              }}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 18px 0',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: 'var(--color-muted)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          {filtered.length} posts
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as PanelSort)}
          style={{
            fontSize: 10,
            color: 'var(--color-muted)',
            background: 'none',
            border: 'none',
            outline: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <option value="score">Sort: Quality score</option>
          <option value="client">Sort: Client</option>
          <option value="newest">Sort: Newest</option>
          <option value="pillar">Sort: Pillar</option>
        </select>
      </div>

      {/* Scrollable post list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
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
        {filtered.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--color-muted)',
              fontStyle: 'italic',
            }}
          >
            {search ? `No posts match \u201C${search}\u201D` : 'No posts to schedule'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 18px',
          borderTop: '0.5px solid rgba(44,62,80,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FDFAF8',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          Select a post to schedule it
        </span>
      </div>
    </div>
  )
})

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '8px 18px 4px',
        fontSize: 9,
        fontWeight: 500,
        color: 'var(--color-muted)',
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        background: '#FDFAF8',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)',
      }}
    >
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
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 10px',
        fontSize: 10,
        fontWeight: 500,
        border: active ? 'none' : '0.5px solid var(--color-border-2)',
        borderRadius: 5,
        background: active ? 'var(--color-brand)' : '#fff',
        color: active ? '#ECE8E1' : 'var(--color-muted)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
