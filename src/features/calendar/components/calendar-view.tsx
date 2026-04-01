'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCalendar } from '@/features/calendar/hooks/use-calendar'
import { getClientColorMap } from '@/components/ui/colors/client-colors'
import { UnscheduledStrip } from './unscheduled-strip'
import { CalendarGrid } from './calendar-grid'
import { PostSidePanel } from './post-side-panel'
import type { CalendarPost, BestTimePlatform } from '@/types/api'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface CalendarViewProps {
  initialPosts: CalendarPost[]
  clients: Array<{ id: string; name: string }>
  bestTimeMap: Record<string, BestTimePlatform[]>
}

export function CalendarView({ initialPosts, clients, bestTimeMap }: CalendarViewProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const {
    unscheduledPosts,
    scheduledPosts,
    selectedPost,
    selectPost,
    clearSelection,
    schedulePost,
    unschedulePost,
    handleDrop,
    saving,
  } = useCalendar(initialPosts)

  const colorMap = useMemo(
    () => getClientColorMap(clients.map((c) => c.id)),
    [clients]
  )

  // Filter by client
  const filteredUnscheduled = selectedClientId
    ? unscheduledPosts.filter((p) => p.client_id === selectedClientId)
    : unscheduledPosts
  const filteredScheduled = selectedClientId
    ? scheduledPosts.filter((p) => p.client_id === selectedClientId)
    : scheduledPosts

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function handleSidebarSave(postId: string, updates: { scheduled_at?: string; platform?: string }) {
    if (updates.scheduled_at) {
      void schedulePost(postId, updates.scheduled_at, updates.platform)
    }
  }

  function handleUnschedule(postId: string) {
    void unschedulePost(postId)
    clearSelection()
  }

  // Best time data for selected post
  const selectedBestTime = selectedPost
    ? bestTimeMap[selectedPost.client_id] ?? null
    : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header: month nav + client filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold text-gray-900 min-w-[160px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {clients.length > 1 && (
          <select
            value={selectedClientId ?? ''}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Unscheduled strip */}
      <UnscheduledStrip
        posts={filteredUnscheduled}
        colorMap={colorMap}
        onPostClick={selectPost}
      />

      {/* Calendar grid */}
      <CalendarGrid
        year={year}
        month={month}
        posts={filteredScheduled}
        colorMap={colorMap}
        onPostClick={selectPost}
        onDrop={handleDrop}
      />

      {/* Side panel */}
      {selectedPost && (
        <PostSidePanel
          post={selectedPost}
          onClose={clearSelection}
          onSave={handleSidebarSave}
          onUnschedule={handleUnschedule}
          bestTimeData={selectedBestTime}
          saving={saving}
        />
      )}
    </div>
  )
}
