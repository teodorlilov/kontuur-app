'use client'

import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { CalendarPost } from '@/types/api'

interface UnscheduledStripProps {
  posts: CalendarPost[]
  colorMap: Map<string, string>
  onPostClick: (postId: string) => void
}

export function UnscheduledStrip({ posts, colorMap, onPostClick }: UnscheduledStripProps) {
  if (posts.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Unscheduled
        </p>
        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
          {posts.length}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {posts.map((post) => {
          const color = colorMap.get(post.client_id) ?? '#6B7280'
          return (
            <button
              key={post.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', post.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => onPostClick(post.id)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing max-w-[220px]"
              style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
            >
              {post.pillar && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: getPillarColor(post.pillar).hex }}
                />
              )}
              <span className="text-xs font-medium text-gray-700 truncate">
                {post.client_name}
              </span>
              {post.platform && (
                <span className="text-[10px] text-gray-400">{post.platform}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
