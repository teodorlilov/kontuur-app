'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, Menu, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { extractInitials } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  SETTINGS_NAV_ITEM,
  getNavItems,
  isNavItemActive,
  type NavBadge,
  type NavItem,
} from '@/components/layout/nav-items'
import { ActiveRunsCard } from '@/components/layout/active-runs-card'
import { CommandPalette } from '@/components/layout/command-palette'
import type { ActiveRun } from '@/types/api'

/** Sidebar widths come from docs/redesign-mocks/dashboard.html (240 / 78). */
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
  clients: Array<{ id: string; name: string }>
  activeRuns: ActiveRun[]
}

function LogoMark({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        'flex items-center gap-2.5 px-2.5 pb-4 pt-0.5 text-[19px] text-ink no-underline',
        collapsed && 'justify-center px-0'
      )}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg font-display text-[15px] italic text-white"
        style={{
          background: 'var(--mark-gradient)',
          boxShadow: '0 4px 14px rgba(46,158,104,0.35)',
        }}
      >
        k
      </span>
      {!collapsed && (
        <span className="font-display leading-none">
          kontuur<span className="text-spring">.</span>
        </span>
      )}
    </Link>
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
        'flex items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-[13.5px] no-underline',
        'transition-[color,background-color,transform] duration-150 ease-contour',
        isActive
          ? 'bg-wash font-medium text-forest shadow-[inset_0_0_0_1px_rgba(46,158,104,0.16)]'
          : 'text-text2 hover:translate-x-0.5 hover:bg-ink/[0.04] hover:text-ink',
        collapsed && 'justify-center px-0'
      )}
    >
      <Icon size={15} className={cn('shrink-0', isActive ? 'text-forest' : 'text-text3')} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {badgeCount > 0 && (
            <span className="rounded-full bg-wash px-[7px] py-0.5 text-[10.5px] font-semibold text-forest">
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
  onSearch: () => void
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
  onSearch,
  onSignOut,
  onNavigate,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden pt-6">
      <div className="px-2.5">
        <LogoMark collapsed={collapsed} />
      </div>

      <button
        type="button"
        onClick={onSearch}
        className={cn(
          'mx-2.5 mb-3 mt-0.5 flex items-center gap-2 rounded-[9px] bg-sunken px-3 py-2',
          'text-[12.5px] text-text3 transition-colors hover:bg-line',
          collapsed && 'mx-2 justify-center gap-0 px-0 py-2.5'
        )}
      >
        <Search size={13} className="shrink-0" />
        {!collapsed && (
          <>
            Search
            <kbd className="ml-auto rounded-[5px] border border-line2 bg-surface px-1.5 py-px text-[9.5px] font-semibold text-text3">
              ⌘K
            </kbd>
          </>
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text3">
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

      {/* Always mounted (it renders nothing when idle) so a run started by cron
          is picked up when the tab regains focus. */}
      {!collapsed && <ActiveRunsCard initialRuns={activeRuns} />}

      <div className="mx-2.5 mb-1 flex flex-col gap-0.5 border-t border-line pt-1.5">
        <SidebarLink
          item={SETTINGS_NAV_ITEM}
          badgeCount={0}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={onSignOut}
          className={cn(
            'flex items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-left text-[13.5px]',
            'text-text2 transition-colors hover:bg-ink/[0.04] hover:text-ink',
            collapsed && 'justify-center px-0'
          )}
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
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-wash text-[11px] font-semibold text-forest">
          {extractInitials(agencyName || 'A')}
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] text-ink">{agencyName || 'Agency'}</div>
            <div className="text-[11px] text-text3">
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
  clients,
  activeRuns,
}: SidebarProps) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const collapsed = useSyncExternalStore(subscribeToCollapse, readCollapsed, () => false)

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    toast('Signed out')
    router.push('/login')
    router.refresh()
  }

  const badgeCounts: Record<NavBadge, number> = { pending: pendingCount, ideas: ideasCount }
  const sharedProps = {
    agencyMode,
    agencyName,
    badgeCounts,
    activeRuns,
    onSearch: () => setPaletteOpen(true),
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
            className={cn('transition-transform duration-300 ease-contour', collapsed && 'rotate-180')}
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        agencyMode={agencyMode}
        clients={clients}
      />
    </>
  )
}
