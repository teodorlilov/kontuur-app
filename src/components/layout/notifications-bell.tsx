'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toast'
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
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 44,
        width: 360,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(44,62,80,0.14)',
        border: '0.5px solid rgba(44,62,80,0.10)',
        zIndex: 50,
        overflow: 'hidden',
        animation: 'dropdown-in 0.15s ease-out',
      }}
    >
      <PanelHeader unreadCount={unreadCount} onMarkAllRead={onMarkAllRead} />

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#B0A898' }}>
            No notifications yet
          </div>
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
    <div
      style={{
        padding: '14px 16px',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1A2630' }}>Notifications</span>
        {unreadCount > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#C07B55',
              background: 'rgba(192,123,85,0.10)',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {unreadCount} new
          </span>
        )}
      </div>
      {unreadCount > 0 && (
        <button
          onClick={onMarkAllRead}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#8A8070',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Mark all read
        </button>
      )}
    </div>
  )
}

/** Section divider label (Today / Earlier). */
function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '8px 16px 4px',
        fontSize: 10,
        fontWeight: 500,
        color: '#8A8070',
        letterSpacing: '1px',
        textTransform: 'uppercase' as const,
      }}
    >
      {label}
    </div>
  )
}

/** Panel footer with "Go to calendar" link. */
function PanelFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderTop: '0.5px solid rgba(44,62,80,0.07)',
        textAlign: 'center',
      }}
    >
      <button
        onClick={onNavigate}
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: '#C07B55',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
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
    // eslint-disable-next-line react-hooks/exhaustive-deps — only fire on open change, not unreadCount
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

  const badgeColor = hasFeedback ? '#B43232' : '#C07B55'
  const badgeAnimation = hasFeedback ? 'notif-pulse 2s infinite' : 'none'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleToggle}
        style={{
          position: 'relative',
          padding: 8,
          borderRadius: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#6B7280',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        aria-label="Notifications"
      >
        <Bell style={{ width: 20, height: 20 }} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: badgeColor,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: badgeAnimation,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        loading ? (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 44,
              width: 360,
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 8px 32px rgba(44,62,80,0.14)',
              border: '0.5px solid rgba(44,62,80,0.10)',
              zIndex: 50,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'dropdown-in 0.15s ease-out',
            }}
          >
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
