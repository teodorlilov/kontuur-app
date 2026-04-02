'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { useCalendar } from '@/features/calendar/hooks/use-calendar'
import { getClientColorMap } from '@/components/ui/colors/client-colors'
import { toast } from '@/components/ui/toast'
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
  const [approvalSending, setApprovalSending] = useState(false)
  const [approvalClientPicker, setApprovalClientPicker] = useState(false)

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

  // Clients that have scheduled posts in the visible month (for approval picker)
  const clientsWithScheduledPosts = useMemo(() => {
    const ids = new Set(filteredScheduled.map((p) => p.client_id))
    return clients.filter((c) => ids.has(c.id))
  }, [filteredScheduled, clients])

  // Get the Monday of the current week for approval
  function getCurrentWeekStart(): string {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
    const monday = new Date(d.setDate(diff))
    return monday.toISOString().slice(0, 10)
  }

  async function handleSendApproval(clientId: string) {
    setApprovalSending(true)
    setApprovalClientPicker(false)
    try {
      const weekStart = getCurrentWeekStart()
      const res = await fetch('/api/approval/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, weekStart }),
      })

      if (!res.ok) {
        const err = (await res.json()) as { error: string }
        toast.error(err.error || 'Failed to generate approval link')
        return
      }

      const data = (await res.json()) as { url: string; postCount: number }
      await navigator.clipboard.writeText(data.url)
      toast.success(`Approval link copied! (${data.postCount} post${data.postCount === 1 ? '' : 's'})`)
    } catch {
      toast.error('Failed to generate approval link')
    } finally {
      setApprovalSending(false)
    }
  }

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

        <div className="flex items-center gap-2">
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

          {/* Send for approval */}
          {clientsWithScheduledPosts.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (clientsWithScheduledPosts.length === 1) {
                    void handleSendApproval(clientsWithScheduledPosts[0]!.id)
                  } else {
                    setApprovalClientPicker((v) => !v)
                  }
                }}
                disabled={approvalSending}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-purple border border-brand-purple-light bg-brand-purple-light rounded-lg px-3 py-2 hover:bg-brand-purple hover:text-white transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {approvalSending ? 'Generating...' : 'Send for approval'}
              </button>

              {/* Client picker dropdown */}
              {approvalClientPicker && clientsWithScheduledPosts.length > 1 && (
                <div className="absolute right-0 top-10 bg-white rounded-lg border border-gray-200 shadow-lg z-30 py-1 min-w-[180px]">
                  <p className="px-3 py-1.5 text-xs text-gray-400 font-medium">Select client</p>
                  {clientsWithScheduledPosts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { void handleSendApproval(c.id) }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
