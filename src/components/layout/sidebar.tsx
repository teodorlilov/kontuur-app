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
  BarChart2,
  Settings,
  X,
  Menu,
  LogOut,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
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
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '20px 22px 6px',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        color: 'rgba(255,255,255,0.25)',
        fontFamily: 'var(--font-sans)',
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
  const active = pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 22px',
        fontSize: 13.5,
        color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
        background: active ? 'var(--sidebar-item-bg-active)' : 'transparent',
        cursor: 'pointer',
        transition: 'color 120ms ease, background 120ms ease',
        textDecoration: 'none',
        minHeight: 36,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = 'var(--sidebar-text-hover)'
          e.currentTarget.style.background = 'var(--sidebar-item-bg-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = 'var(--sidebar-text)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && item.badge > 0 ? (
        <span
          style={{
            background: 'var(--sidebar-badge-bg)',
            color: 'var(--sidebar-badge-text)',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {item.badge}
        </span>
      ) : null}
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
    <nav style={{ flex: 1 }}>
      <SectionLabel>Workspace</SectionLabel>
      {items.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
      ))}
    </nav>
  )
}

export function Sidebar({ agencyMode, pendingCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const agencyNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={16} /> },
    { label: 'Clients', href: '/clients', icon: <Users size={16} /> },
    { label: 'Generate posts', href: '/generate', icon: <Sparkles size={16} /> },
    {
      label: 'Review queue',
      href: '/review',
      icon: <ClipboardList size={16} />,
      badge: pendingCount,
    },
    { label: 'Calendar', href: '/calendar', icon: <Calendar size={16} /> },
    { label: 'Analytics', href: '/analytics', icon: <BarChart2 size={16} /> },
  ]

  const soloNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={16} /> },
    { label: 'Create content', href: '/generate', icon: <Sparkles size={16} /> },
    { label: 'My drafts', href: '/review', icon: <ClipboardList size={16} />, badge: pendingCount },
    { label: 'My calendar', href: '/calendar', icon: <Calendar size={16} /> },
    { label: 'My results', href: '/analytics', icon: <BarChart2 size={16} /> },
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo area */}
      <div
        style={{
          padding: '26px 22px 18px',
          borderBottom: '0.5px solid var(--sidebar-border)',
        }}
      >
        <Link href="/dashboard" style={{ display: 'block' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kontuur_logo_white.svg" alt="kontuur" style={{ width: '100%', height: 'auto' }} />
        </Link>
      </div>

      <NavLinks items={navItems} pathname={pathname} onClose={onClose} />

      {/* Footer */}
      <div style={{ padding: '16px 0', borderTop: '0.5px solid var(--sidebar-border)' }}>
        <NavLink
          item={{ label: 'Settings', href: '/settings', icon: <Settings size={16} /> }}
          pathname={pathname}
          onClose={onClose}
        />
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '8px 22px',
            fontSize: 13.5,
            color: 'var(--sidebar-text)',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'color 120ms ease, background 120ms ease',
            border: 'none',
            width: '100%',
            textAlign: 'left',
            fontFamily: 'var(--font-sans)',
            minHeight: 36,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--sidebar-text-hover)'
            e.currentTarget.style.background = 'var(--sidebar-item-bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--sidebar-text)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
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
