'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, Menu, X } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { extractInitials } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  SETTINGS_NAV_ITEM,
  SIDEBAR_ROW,
  SIDEBAR_ROW_IDLE,
  getNavItems,
  isNavItemActive,
  type NavBadge,
  type NavItem,
} from '@/components/layout/nav-items'
import { Wordmark } from '@/components/layout/wordmark'
import { useShell } from '@/components/layout/shell-context'
import { DesignInCanvaButton } from '@/components/layout/design-in-canva-button'
import { ActiveRunsCard } from '@/components/layout/active-runs-card'
import { useActiveRuns } from '@/components/layout/use-active-runs'
import type { ActiveRun } from '@/types/api'

/** Sidebar widths come from docs/redesign-mocks/archive/dashboard.html (240 / 78). */
const COLLAPSE_STORAGE_KEY = 'kontuur:sidebar-collapsed'
const COLLAPSE_EVENT = 'kontuur:sidebar-collapsed-change'

/**
 * The collapsed flag lives in localStorage, so it is read through
 * useSyncExternalStore: the server snapshot is "expanded", and the client
 * re-renders with the stored value after hydration.
 */
function subscribeToCollapse(onStoreChange: () => void) {
  window.addEventListener(COLLAPSE_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

function readCollapsed(): boolean {
  return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'
}

function writeCollapsed(next: boolean) {
  window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0')
  window.dispatchEvent(new Event(COLLAPSE_EVENT))
}

interface SidebarProps {
  agencyMode: 'agency' | 'solo'
  agencyName: string
  pendingCount: number
  ideasCount: number
  activeRuns: ActiveRun[]
}

function LogoMark({ collapsed }: { collapsed: boolean }) {
  return (
    <Wordmark
      href="/dashboard"
      markOnly={collapsed}
      className={cn('px-2.5 pb-4 pt-0.5', collapsed && 'px-0')}
    />
  )
}

function SidebarLink({
  item,
  badgeCount,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  badgeCount: number
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const isActive = isNavItemActive(pathname, item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-body no-underline',
        'transition-[color,background-color,transform] duration-150 ease-contour',
        isActive
          ? // The rail's one lime answer: where you are standing. Pine Deep on
            // lime is 10.87:1, and the inset Pine Deep edge at 45% gives the
            // plate a boundary — a lime silhouette on paper is only 1.35:1.
            'bg-accent font-semibold text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)]'
          : 'text-text2 hover:translate-x-0.5 hover:bg-ink/[0.04] hover:text-ink',
        collapsed && 'justify-center px-0'
      )}
    >
      <Icon size={15} className={cn('shrink-0', isActive ? 'text-forest-deep' : 'text-text3')} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {badgeCount > 0 && (
            <span
              className={cn(
                'rounded-full px-[7px] py-0.5 text-micro font-semibold',
                // Inverts on the active plate — Wash on lime is unreadable.
                isActive ? 'bg-forest-deep text-accent' : 'bg-wash text-forest'
              )}
            >
              {badgeCount}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

interface SidebarContentProps {
  agencyMode: 'agency' | 'solo'
  agencyName: string
  badgeCounts: Record<NavBadge, number>
  activeRuns: ActiveRun[]
  collapsed: boolean
  onSignOut: () => void
  onNavigate?: () => void
}

/** Shared body of the desktop rail and the mobile drawer. */
function SidebarContent({
  agencyMode,
  agencyName,
  badgeCounts,
  activeRuns,
  collapsed,
  onSignOut,
  onNavigate,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden pt-6">
      <div className="px-2.5">
        <LogoMark collapsed={collapsed} />
      </div>

      {/* No search row and no bell: both live in the page header's rail, where
          the mock puts them and where they read as page chrome rather than
          navigation. */}
      {!collapsed && (
        <div className="px-3 pb-2 pt-1 text-label font-semibold uppercase text-text3">
          Workspace
        </div>
      )}

      <nav className="flex flex-col gap-0.5 px-2.5">
        {getNavItems(agencyMode).map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            badgeCount={item.badge ? badgeCounts[item.badge] : 0}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="flex-1" />

      {/* Hidden rather than dropped when collapsed — polling is owned by
          useActiveRuns above, so this is purely what the rail has room for. */}
      {!collapsed && <ActiveRunsCard runs={activeRuns} />}

      {/* Canva stays: it opens an external tool and belongs to the workspace,
          and the header rail has no slot for it. */}
      <div className="mx-2.5 mb-1 flex flex-col gap-0.5 border-t border-line pt-1.5">
        <DesignInCanvaButton collapsed={collapsed} />
        <SidebarLink
          item={SETTINGS_NAV_ITEM}
          badgeCount={0}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={onSignOut}
          className={cn(SIDEBAR_ROW, SIDEBAR_ROW_IDLE, collapsed && 'justify-center px-0')}
        >
          <LogOut size={15} className="shrink-0 text-text3" />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      <div
        className={cn(
          'mx-1 mb-0.5 flex items-center gap-2.5 rounded-[11px] bg-sunken p-2.5',
          collapsed && 'justify-center p-2'
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-wash text-micro font-semibold text-forest">
          {extractInitials(agencyName || 'A')}
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-body text-ink">{agencyName || 'Agency'}</div>
            <div className="text-micro text-text3">
              {agencyMode === 'solo' ? 'Solo workspace' : 'Agency workspace'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar({
  agencyMode,
  agencyName,
  pendingCount,
  ideasCount,
  activeRuns,
}: SidebarProps) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const collapsed = useSyncExternalStore(subscribeToCollapse, readCollapsed, () => false)
  // The server count is a per-hard-load snapshot; a surface that mutates the
  // queue (the review tab) reports the live number through the shell.
  const { pendingCount: livePendingCount } = useShell()
  // Polled once here, then handed to both the rail and the drawer as data —
  // two SidebarContent instances must not mean two pollers.
  const runs = useActiveRuns(activeRuns)

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    toast('Signed out')
    router.push('/login')
    router.refresh()
  }

  const badgeCounts: Record<NavBadge, number> = {
    pending: livePendingCount ?? pendingCount,
    ideas: ideasCount,
  }
  const sharedProps = {
    agencyMode,
    agencyName,
    badgeCounts,
    activeRuns: runs,
    onSignOut: handleSignOut,
  }

  return (
    <>
      <aside
        className={cn(
          'app-sidebar relative hidden shrink-0 rounded-card border border-ink/[0.06] bg-surface',
          'shadow-card transition-[width] duration-300 ease-contour md:block',
          collapsed ? 'w-[78px]' : 'w-60'
        )}
      >
        <button
          type="button"
          onClick={() => writeCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-6 z-10 grid size-[26px] place-items-center rounded-full border border-line bg-surface text-text2 shadow-pop transition-colors hover:text-forest"
        >
          <ChevronLeft
            size={12}
            className={cn(
              'transition-transform duration-300 ease-contour',
              collapsed && 'rotate-180'
            )}
          />
        </button>
        <SidebarContent {...sharedProps} collapsed={collapsed} />
      </aside>

      <button
        type="button"
        className="print-hide fixed left-3 top-3 z-40 rounded-chip border border-line bg-surface p-2 shadow-pop md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={16} className="text-text2" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-ink/45"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative h-full w-60 bg-surface shadow-frame">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 z-10 text-text2"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <SidebarContent
              {...sharedProps}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  )
}
