'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Sparkles,
  ClipboardList,
  Calendar,
  MessageSquare,
  BarChart2,
  Settings,
  X,
  Menu,
  LogOut,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { extractInitials } from '@/utils/format'
import { LogoMark } from '@/components/ui/logo-mark'
import { toast } from 'sonner'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number
}

interface SidebarProps {
  agencyMode: 'agency' | 'solo'
  pendingCount?: number
  ideasCount?: number
  agencyName?: string
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 500,
        color: 'var(--sidebar-section-label)',
        letterSpacing: '2.5px',
        textTransform: 'uppercase',
        marginBottom: 8,
        padding: '0 4px',
      }}
    >
      {children}
    </div>
  )
}

function NavLink({
  item,
  pathname,
  onClose,
}: {
  item: NavItem
  pathname: string
  onClose?: () => void
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 7,
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-item-bg-active)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.15s',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'var(--sidebar-item-bg-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <span style={{ color: isActive ? 'var(--sidebar-icon-active)' : 'var(--sidebar-icon)', display: 'flex' }}>
        {item.icon}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            background: 'var(--sidebar-badge-bg)',
            color: 'var(--sidebar-badge-text)',
            padding: '2px 6px',
            borderRadius: 4,
            lineHeight: 1.4,
          }}
        >
          {item.badge}
        </span>
      )}
    </Link>
  )
}

function NavLinks({
  items,
  pathname,
  onClose,
}: {
  items: NavItem[]
  pathname: string
  onClose?: () => void
}) {
  return (
    <nav style={{ flex: 1, padding: '0 12px' }}>
      <div style={{ marginBottom: 8 }}>
        <SectionLabel>Workspace</SectionLabel>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
        ))}
      </div>
    </nav>
  )
}

function SettingsLink({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const isActive = pathname === '/settings' || pathname.startsWith('/settings/')
  return (
    <Link
      href="/settings"
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 7,
        cursor: 'pointer',
        textDecoration: 'none',
        marginBottom: 6,
        background: isActive ? 'var(--sidebar-item-bg-active)' : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'rgba(236,232,225,0.06)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <Settings size={14} style={{ color: isActive ? 'var(--sidebar-icon-active)' : 'rgba(236,232,225,0.30)' }} />
      <span style={{ fontSize: 12, color: isActive ? 'var(--sidebar-text-active)' : 'rgba(236,232,225,0.38)' }}>
        Settings
      </span>
    </Link>
  )
}

function AgencyChip({ agencyName }: { agencyName: string }) {
  const initials = extractInitials(agencyName || 'A')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(236,232,225,0.06)',
        border: '0.5px solid rgba(236,232,225,0.10)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #C07B55, #8B5A3A)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 500,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(236,232,225,0.70)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {agencyName || 'Agency'}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(236,232,225,0.30)' }}>Agency workspace</div>
      </div>
    </div>
  )
}

function DecorativeRings() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
      viewBox="0 0 220 700"
      fill="none"
    >
      <ellipse cx="200" cy="350" rx="180" ry="180" stroke="rgba(236,232,225,0.025)" strokeWidth="50" />
      <ellipse cx="200" cy="350" rx="120" ry="120" stroke="rgba(192,123,85,0.035)" strokeWidth="30" />
    </svg>
  )
}

export function Sidebar({ agencyMode, pendingCount = 0, ideasCount = 0, agencyName = '' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const agencyNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={15} /> },
    { label: 'Clients', href: '/clients', icon: <Users size={15} /> },
    { label: 'Generate posts', href: '/generate', icon: <Sparkles size={15} /> },
    { label: 'Review queue', href: '/review', icon: <ClipboardList size={15} />, badge: pendingCount },
    { label: 'Calendar', href: '/calendar', icon: <Calendar size={15} /> },
    { label: 'Client ideas', href: '/ideas', icon: <MessageSquare size={15} />, badge: ideasCount },
    { label: 'Analytics', href: '/analytics', icon: <BarChart2 size={15} /> },
  ]

  const soloNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={15} /> },
    { label: 'Create content', href: '/generate', icon: <Sparkles size={15} /> },
    { label: 'My drafts', href: '/review', icon: <ClipboardList size={15} />, badge: pendingCount },
    { label: 'My calendar', href: '/calendar', icon: <Calendar size={15} /> },
    { label: 'My results', href: '/analytics', icon: <BarChart2 size={15} /> },
  ]

  const navItems = agencyMode === 'solo' ? soloNav : agencyNav

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    toast('Signed out')
    router.push('/login')
    router.refresh()
  }

  const sidebarContent = (onClose?: () => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <DecorativeRings />

      {/* Logo */}
      <div style={{ padding: '26px 22px 32px', position: 'relative', zIndex: 1 }}>
        <Link href="/dashboard" style={{ display: 'inline-block', textDecoration: 'none' }}>
          <LogoMark />
        </Link>
      </div>

      {/* Nav */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
        <NavLinks items={navItems} pathname={pathname} onClose={onClose} />
      </div>

      {/* Footer */}
      <div style={{ padding: '12px', position: 'relative', zIndex: 1 }}>
        <SettingsLink pathname={pathname} onClose={onClose} />

        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 7,
            fontSize: 12,
            color: 'rgba(236,232,225,0.38)',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'background 0.15s',
            border: 'none',
            width: '100%',
            textAlign: 'left',
            fontFamily: 'var(--font-sans)',
            marginBottom: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(236,232,225,0.06)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <LogOut size={14} style={{ color: 'rgba(236,232,225,0.30)' }} />
          Sign out
        </button>

        <AgencyChip agencyName={agencyName} />
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:block shrink-0 h-screen sticky top-0"
        style={{ width: 224, background: 'var(--sidebar-bg)' }}
      >
        {sidebarContent()}
      </aside>

      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-lg border shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-1)' }}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={16} style={{ color: 'var(--color-text-2)' }} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,25,24,0.45)' }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative h-full shadow-xl"
            style={{ width: 224, background: 'var(--sidebar-bg)' }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4"
              style={{
                color: 'var(--sidebar-text)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                zIndex: 2,
              }}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            {sidebarContent(() => setMobileOpen(false))}
          </aside>
        </div>
      )}
    </>
  )
}
