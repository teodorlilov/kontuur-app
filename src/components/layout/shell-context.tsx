'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import dynamic from 'next/dynamic'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toast'
import { NOTIFICATION_COLUMNS } from '@/lib/queries/select-columns'
import type { EnrichedNotification } from '@/types/api'

/**
 * Split out of this bundle rather than imported at the top of the file. The
 * palette pulls in Radix Dialog, and this provider mounts on every dashboard
 * page — a top-level import made every dashboard route pay ~40kB for a dialog most
 * visits never open. The ⌘K listener lives here instead (see usePaletteHotkey),
 * so the shortcut still works before the chunk has been fetched.
 */
const CommandPalette = dynamic(() =>
  import('@/components/layout/command-palette').then((m) => m.CommandPalette)
)

interface ShellValue {
  /** Root of every breadcrumb trail. */
  agencyName: string
  /** Initials of the signed-in user — the rail avatar. Not the agency's. */
  userInitials: string
  /**
   * Today, already formatted in the agency's timezone. Pre-formatted on the
   * server because a client component calling new Date() would render one value
   * during SSR and another after hydration, and would silently use the browser's
   * timezone instead of the agency's.
   */
  todayLabel: string
  /**
   * The agency's IANA zone. Any client component formatting a date must pass this, or it formats
   * in the server's zone during SSR and the visitor's after hydration — a mismatch that also shows
   * the wrong day near midnight.
   */
  timezone: string
  openPalette: () => void
  notifications: NotificationsValue
  /**
   * Live pending-review count for the sidebar badge. The server-rendered
   * count is a snapshot per hard load — layouts do not re-render on client
   * navigation, so a surface that mutates the queue reports the truth here.
   * Null = no surface has reported yet; the badge falls back to the snapshot.
   */
  pendingCount: number | null
  setPendingCount: (count: number) => void
}

interface NotificationsValue {
  items: EnrichedNotification[]
  loading: boolean
  unreadCount: number
  /** Client feedback is the one notification that should nag. */
  hasFeedback: boolean
  refetch: () => Promise<void>
  markAllRead: () => Promise<void>
  markOneRead: (id: string) => Promise<void>
}

const ShellContext = createContext<ShellValue | null>(null)

/** App-shell state — agency identity, the palette, and notifications. */
export function useShell(): ShellValue {
  const value = useContext(ShellContext)
  if (!value) throw new Error('useShell must be used inside <ShellProvider>')
  return value
}

async function fetchNotifications(): Promise<EnrichedNotification[]> {
  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(30)

  // Narrows three columns the schema leaves wider than the app treats them:
  // `type` is a free string in Postgres but only ever one of NotificationType,
  // and `created_at`/`is_read` are nullable columns that every insert path sets.
  return (data ?? []) as EnrichedNotification[]
}

function buildToastMessage(n: EnrichedNotification): string {
  if (n.type === 'client_feedback' && n.feedback_text) {
    const preview =
      n.feedback_text.length > 80 ? `${n.feedback_text.slice(0, 80)}…` : n.feedback_text
    return `"${preview}"`
  }
  return n.message ?? 'New client response'
}

/**
 * Fetch on mount + subscribe to Realtime INSERT events.
 *
 * This lives in the provider rather than in NotificationsBell because the bell
 * now renders inside the page header, which remounts on every navigation. One
 * fetch and one Realtime channel per session, not per route change. It also
 * makes a duplicate impossible: the desktop rail is `hidden md:block` — hidden,
 * not unmounted — so with the mobile drawer open the sidebar rendered twice and
 * two bells both subscribed to the same channel name.
 */
function useNotifications(): NotificationsValue {
  const [items, setItems] = useState<EnrichedNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setItems(await fetchNotifications())
    } catch (err) {
      // Swallowed on purpose — the bell is ambient, and a failed poll must not
      // take the shell down with it. Logged so it is not invisible.
      console.warn('[notifications] could not load the list:', err)
    } finally {
      setLoading(false)
    }
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
          setItems((prev) => [n, ...prev].slice(0, 30))
          toast(buildToastMessage(n))
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    } catch (err) {
      // The optimistic update above stands: the next refetch reconciles it against
      // the server, so rolling back here would only flicker the badge.
      console.warn('[notifications] could not mark all read:', err)
    }
  }, [])

  const markOneRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    } catch (err) {
      // As above: the optimistic read state survives, the next refetch reconciles.
      console.warn(`[notifications] could not mark ${id} read:`, err)
    }
  }, [])

  // Memoised because this object is the ShellValue's only unstable dependency:
  // returning a fresh literal each render defeated the provider's useMemo
  // entirely, re-rendering every consumer on every render.
  return useMemo(
    () => ({
      items,
      loading,
      unreadCount: items.filter((n) => !n.is_read).length,
      hasFeedback: items.some((n) => !n.is_read && n.type === 'client_feedback'),
      refetch,
      markAllRead,
      markOneRead,
    }),
    [items, loading, refetch, markAllRead, markOneRead]
  )
}

/**
 * Owns ⌘K. Deliberately not inside CommandPalette: that component is loaded on
 * demand, so a listener living there would not exist until after the very
 * shortcut meant to summon it had been pressed.
 */
function usePaletteHotkey(onOpen: () => void): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // Same suspension rule the page-level shortcut handlers follow: a modal layer (the canvas
        // editor, a dialog) owns the keyboard while it is open.
        if (document.querySelector('[role="dialog"]')) return
        event.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpen])
}

interface ShellProviderProps {
  agencyName: string
  agencyMode: 'agency' | 'solo'
  userInitials: string
  todayLabel: string
  timezone: string
  clients: Array<{ id: string; name: string }>
  children: ReactNode
}

/**
 * Holds the app-shell state the page header reads, so every dashboard page does
 * not thread the same props. Mounted in the dashboard layout, which is what lets
 * the notifications channel survive navigation.
 */
export function ShellProvider({
  agencyName,
  agencyMode,
  userInitials,
  todayLabel,
  timezone,
  clients,
  children,
}: ShellProviderProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const notifications = useNotifications()

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  usePaletteHotkey(openPalette)

  const value = useMemo<ShellValue>(
    () => ({
      agencyName,
      userInitials,
      todayLabel,
      timezone,
      openPalette,
      notifications,
      pendingCount,
      setPendingCount,
    }),
    [agencyName, userInitials, todayLabel, timezone, openPalette, notifications, pendingCount]
  )

  return (
    <ShellContext.Provider value={value}>
      {children}
      {/* Rendered only while open, which is what keeps its chunk — and Radix
          Dialog with it — out of every dashboard route's initial payload. */}
      {paletteOpen && (
        <CommandPalette
          open
          onOpenChange={setPaletteOpen}
          agencyMode={agencyMode}
          clients={clients}
        />
      )}
    </ShellContext.Provider>
  )
}
