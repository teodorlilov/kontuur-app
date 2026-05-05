'use client'

import { memo, useState } from 'react'
import { PostEventPill } from './post-event-pill'
import type { CalendarPost } from '@/types/api'

const MAX_VISIBLE = 2

interface ClientStyle {
  dotColor: string
  bgColor: string
  textColor: string
}

interface DayCellProps {
  date: Date
  isToday: boolean
  isOtherMonth: boolean
  posts: CalendarPost[]
  onPostClick: (postId: string) => void
  onDayClick: (date: Date) => void
  onDrop: (postId: string, dateKey: string) => void
  getClientStyle: (clientId: string) => ClientStyle
}

/** Single day cell in the month grid. */
export const DayCell = memo(function DayCell({
  date,
  isToday: today,
  isOtherMonth,
  posts,
  onPostClick,
  onDayClick,
  onDrop,
  getClientStyle,
}: DayCellProps) {
  const [dragOver, setDragOver] = useState(false)

  const dayNum = date.getDate()
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`

  return (
    <div
      onClick={() => onDayClick(date)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const postId = e.dataTransfer.getData('text/plain')
        if (postId) onDrop(postId, dateKey)
      }}
      style={{
        background: dragOver
          ? 'rgba(192,123,85,0.08)'
          : isOtherMonth
            ? '#FDFBF8'
            : '#fff',
        border: today
          ? '1.5px solid var(--color-terracotta)'
          : '0.5px solid var(--color-border-1)',
        borderRadius: 10,
        padding: '8px 8px 6px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        overflow: 'hidden',
        minHeight: 0,
        opacity: isOtherMonth ? 0.45 : 1,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!today) e.currentTarget.style.borderColor = 'var(--color-border-3)'
        e.currentTarget.style.boxShadow = '0 1px 6px rgba(44,62,80,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = today
          ? 'var(--color-terracotta)'
          : 'var(--color-border-1)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Day number */}
      {today ? (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--color-terracotta)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
            marginBottom: 2,
          }}
        >
          {dayNum}
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: isOtherMonth ? 'rgba(44,62,80,0.22)' : 'var(--color-text-1)',
            lineHeight: 1,
            flexShrink: 0,
            marginBottom: 2,
          }}
        >
          {dayNum}
        </div>
      )}

      {/* Post event pills */}
      {posts.slice(0, MAX_VISIBLE).map((post) => {
        const style = getClientStyle(post.client_id)
        return (
          <PostEventPill
            key={post.id}
            post={post}
            onPostClick={onPostClick}
            {...style}
          />
        )
      })}

      {/* Overflow badge */}
      {posts.length > MAX_VISIBLE && (
        <div
          style={{
            fontSize: 9,
            color: 'var(--color-muted)',
            background: 'rgba(44,62,80,0.06)',
            padding: '1px 4px',
            borderRadius: 3,
            alignSelf: 'flex-start',
          }}
        >
          +{posts.length - MAX_VISIBLE}
        </div>
      )}
    </div>
  )
})
