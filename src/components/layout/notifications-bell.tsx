'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useShell } from '@/components/layout/shell-context'
import { TOOL_ROW } from '@/components/layout/page-header/shared'
import { Spinner } from '@/components/ui/spinner'
import { parseTimestamp } from '@/utils/format'
import { NotificationItem } from './notification-item'
import type { EnrichedNotification } from '@/types/api'

/** Check if a date is today. */
function isToday(date: Date): boolean {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

// ---- Panel Component ----

const PANEL =
  'absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-panel border border-line ' +
  'bg-surface shadow-pop [animation:dropdown-in_150ms_ease-out]'

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
    <div className={PANEL}>
      <PanelHeader unreadCount={unreadCount} onMarkAllRead={onMarkAllRead} />

      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-text3">No notifications yet</div>
        ) : (
          <>
            {today.length > 0 && <SectionHeader label="Today" />}
            {today.map((n) => (
              <NotificationItem key={n.id} notification={n} onMarkRead={onMarkRead} onNavigate={onNavigate} />
            ))}
            {earlier.length > 0 && <SectionHeader label="Earlier" />}
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

/**
 * Notification bell for the header rail: trigger, badge, and panel.
 *
 * Purely presentational. The fetch and the Realtime subscription live in
 * ShellProvider, which sits in the dashboard layout — this component remounts
 * on every navigation and must not re-open a channel each time.
 */
export function NotificationsBell() {
  const router = useRouter()
  const { notifications } = useShell()
  const { items, loading, unreadCount, hasFeedback, refetch, markAllRead, markOneRead } = notifications
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
      <button onClick={handleToggle} aria-label="Notifications" className={TOOL_ROW}>
        <Bell size={15} className="shrink-0" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute right-0.5 top-0.5 size-[6px] rounded-full border-[1.5px] border-paper',
              // Client feedback is the one notification that should nag.
              hasFeedback ? 'notif-pulse bg-danger' : 'bg-spring'
            )}
          />
        )}
      </button>

      {open &&
        (loading ? (
          <div className={cn(PANEL, 'grid place-items-center p-8')}>
            <Spinner size="sm" />
          </div>
        ) : (
          <NotificationPanel
            notifications={items}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            onMarkRead={markOneRead}
            onNavigate={handleNavigate}
          />
        ))}
    </div>
  )
}
