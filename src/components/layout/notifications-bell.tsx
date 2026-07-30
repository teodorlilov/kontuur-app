'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { Spinner } from '@/components/ui/spinner'
import { NOTIFICATION_COLUMNS } from '@/lib/queries/select-columns'
import { parseTimestamp } from '@/utils/format'
import { NotificationItem } from './notification-item'
import type { EnrichedNotification } from '@/types/api'

/** Check if a date is today. */
function isToday(date: Date): boolean {
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

/** Build a toast message from a notification. */
function buildToastMessage(n: EnrichedNotification): string {
  if (n.type === 'client_feedback' && n.feedback_text) {
    const preview = n.feedback_text.length > 80 ? n.feedback_text.slice(0, 80) + '…' : n.feedback_text
    return `"${preview}"`
  }
  return n.message ?? 'New client response'
}

/** True if any unread notification is client feedback (controls badge colour). */
function hasFeedbackUnread(notifications: EnrichedNotification[]): boolean {
  return notifications.some((n) => !n.is_read && n.type === 'client_feedback')
}

// ---- Data Hook ----

/** Fetch notifications from Supabase. */
async function fetchNotifications(): Promise<EnrichedNotification[]> {
  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(30)
  return (data ?? []) as EnrichedNotification[]
}

/** Fetch on mount + subscribe to Realtime INSERT events. */
function useNotifications() {
  const [notifications, setNotifications] = useState<EnrichedNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications())
    } catch { /* must never crash UI */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void refetch()
    const supabase = createBrowserSupabaseClient()
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          // Realtime payload.new is untyped — cast is safe because we control the INSERT schema
          const n = payload.new as EnrichedNotification
          setNotifications((prev) => [n, ...prev].slice(0, 30))
          toast(buildToastMessage(n))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refetch])

  return { notifications, setNotifications, loading, refetch }
}

// ---- Panel Component ----

/** Dropdown panel showing notifications grouped by Today / Earlier. */
function NotificationPanel({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
  onNavigate,
}: {
  notifications: EnrichedNotification[]
  unreadCount: number
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
  onNavigate: () => void
}) {
  const today = notifications.filter((n) => isToday(parseTimestamp(n.created_at)))
  const earlier = notifications.filter((n) => !isToday(parseTimestamp(n.created_at)))

  return (
    <div className="absolute right-0 top-11 z-50 w-[360px] overflow-hidden rounded-panel border border-line bg-surface shadow-pop [animation:dropdown-in_150ms_ease-out]">
      <PanelHeader unreadCount={unreadCount} onMarkAllRead={onMarkAllRead} />

      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-text3">No notifications yet</div>
        ) : (
          <>
            {today.length > 0 && (
              <SectionHeader label="Today" />
            )}
            {today.map((n) => (
              <NotificationItem key={n.id} notification={n} onMarkRead={onMarkRead} onNavigate={onNavigate} />
            ))}
            {earlier.length > 0 && (
              <SectionHeader label="Earlier" />
            )}
            {earlier.map((n) => (
              <NotificationItem key={n.id} notification={n} onMarkRead={onMarkRead} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </div>

      <PanelFooter onNavigate={onNavigate} />
    </div>
  )
}

/** Panel header with title, unread count badge, and mark-all-read button. */
function PanelHeader({ unreadCount, onMarkAllRead }: { unreadCount: number; onMarkAllRead: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold text-ink">Notifications</span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium text-forest">
            {unreadCount} new
          </span>
        )}
      </div>
      {unreadCount > 0 && (
        <button onClick={onMarkAllRead} className="text-[11px] font-medium text-text2 hover:text-forest">
          Mark all read
        </button>
      )}
    </div>
  )
}

/** Section divider label (Today / Earlier). */
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.1em] text-text3">
      {label}
    </div>
  )
}

/** Panel footer with "Go to calendar" link. */
function PanelFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="border-t border-line px-4 py-2.5 text-center">
      <button onClick={onNavigate} className="text-[12px] font-medium text-forest hover:underline">
        Go to calendar →
      </button>
    </div>
  )
}

// ---- Main Component ----

/** Notification bell with badge, Realtime subscription, and mark-as-read. */
export function NotificationsBell() {
  const router = useRouter()
  const { notifications, setNotifications, loading, refetch } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.is_read).length
  const hasFeedback = hasFeedbackUnread(notifications)

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Auto-mark-as-read 1s after panel opens
  useEffect(() => {
    if (!open || unreadCount === 0) return
    const t = setTimeout(() => void markAllRead(), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on open change only, not on unreadCount
  }, [open])

  /** Mark all notifications as read (optimistic + DB). */
  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    } catch { /* next refetch reconciles */ }
  }

  /** Mark a single notification as read (optimistic + DB). */
  async function markOneRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    } catch { /* silent */ }
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) void refetch()
  }

  function handleNavigate() {
    setOpen(false)
    router.push('/calendar')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative grid size-[38px] place-items-center rounded-sm border border-line2 text-text2 transition-colors hover:border-forest hover:bg-wash hover:text-forest"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -right-1 -top-1 grid size-[17px] place-items-center rounded-full',
              'border-2 border-paper text-[9.5px] font-bold text-white',
              // Client feedback is the one notification that should nag.
              hasFeedback ? 'bg-danger notif-pulse' : 'bg-spring'
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        loading ? (
          <div className="absolute right-0 top-11 z-50 grid w-[360px] place-items-center rounded-panel border border-line bg-surface p-8 shadow-pop [animation:dropdown-in_150ms_ease-out]">
            <Spinner size="sm" />
          </div>
        ) : (
          <NotificationPanel
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            onMarkRead={markOneRead}
            onNavigate={handleNavigate}
          />
        )
      )}
    </div>
  )
}
