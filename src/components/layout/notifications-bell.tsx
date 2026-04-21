'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/utils/format'
import { Spinner } from '@/components/ui/spinner'
import type { Database } from '@/types/database'

type Notification = Database['public']['Tables']['notifications']['Row']

// Module-level cache — survives remounts across tab navigations (layout re-mounts on every RSC render)
let notifCache: { data: Notification[]; ts: number } | null = null
const CACHE_TTL = 30_000

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    if (notifCache && Date.now() - notifCache.ts < CACHE_TTL) {
      setNotifications(notifCache.data)
      setLoading(false)
      return
    }

    async function load() {
      const supabase = createBrowserSupabaseClient()
      const { data } = await supabase
        .from('notifications')
        .select('id, agency_id, message, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      const result = data ?? []
      notifCache = { data: result, ts: Date.now() }
      setNotifications(result)
      setLoading(false)
    }
    void load()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function markRead(id: string) {
    const supabase = createBrowserSupabaseClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      if (notifCache) notifCache = { data: updated, ts: notifCache.ts }
      return updated
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--color-terracotta)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-30 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No notifications yet</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`px-4 py-3 text-sm cursor-pointer transition-colors hover:bg-gray-50 border-b border-gray-50 last:border-0 ${
                    n.is_read ? 'text-gray-500' : 'text-gray-800 font-medium'
                  }`}
                >
                  <p>{n.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatRelativeTime(new Date(n.created_at))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
