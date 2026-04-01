'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { getDaysInMonth, toDateKey, groupPostsByDate, isToday, isSameMonth } from '@/features/calendar/helpers'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { CalendarPost } from '@/types/api'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_VISIBLE_POSTS = 3

interface CalendarGridProps {
  year: number
  month: number
  posts: CalendarPost[]
  colorMap: Map<string, string>
  onPostClick: (postId: string) => void
  onDrop: (postId: string, date: string) => void
}

export function CalendarGrid({ year, month, posts, colorMap, onPostClick, onDrop }: CalendarGridProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const days = getDaysInMonth(year, month)
  const postsByDate = groupPostsByDate(posts)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDragEnter(dateKey: string) {
    setDragOverDate(dateKey)
  }

  function handleDragLeave() {
    setDragOverDate(null)
  }

  function handleDropOnDate(e: React.DragEvent, dateKey: string) {
    e.preventDefault()
    setDragOverDate(null)
    const postId = e.dataTransfer.getData('text/plain')
    if (postId) onDrop(postId, dateKey)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAY_HEADERS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const dateKey = toDateKey(date)
          const inMonth = isSameMonth(date, month, year)
          const today = isToday(date)
          const dayPosts = postsByDate.get(dateKey) ?? []
          const hasOverflow = dayPosts.length > MAX_VISIBLE_POSTS
          const visiblePosts = hasOverflow ? dayPosts.slice(0, MAX_VISIBLE_POSTS) : dayPosts
          const isDragTarget = dragOverDate === dateKey

          return (
            <div
              key={dateKey}
              className={cn(
                'min-h-[100px] border-b border-r border-gray-100 p-1.5 transition-colors',
                !inMonth && 'bg-gray-50',
                isDragTarget && 'bg-indigo-50 ring-2 ring-inset ring-[#534AB7]'
              )}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnter(dateKey)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnDate(e, dateKey)}
            >
              <p
                className={cn(
                  'text-xs mb-1',
                  !inMonth && 'text-gray-300',
                  inMonth && 'text-gray-600',
                  today && 'font-bold text-[#534AB7] bg-indigo-50 w-6 h-6 rounded-full flex items-center justify-center'
                )}
              >
                {date.getDate()}
              </p>
              <div className="flex flex-col gap-0.5">
                {visiblePosts.map((post) => {
                  const color = colorMap.get(post.client_id) ?? '#6B7280'
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => onPostClick(post.id)}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate text-white hover:opacity-80 transition-opacity flex items-center gap-0.5"
                      style={{ backgroundColor: color }}
                      title={`${post.client_name}${post.pillar ? ` · ${post.pillar}` : ''}: ${post.caption?.slice(0, 60) ?? 'No caption'}`}
                    >
                      {post.pillar && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: getPillarColor(post.pillar).hex }}
                        />
                      )}
                      <span className="truncate">{post.client_name}</span>
                    </button>
                  )
                })}
                {hasOverflow && (
                  <p className="text-[10px] text-gray-400 px-1">
                    +{dayPosts.length - MAX_VISIBLE_POSTS} more
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
