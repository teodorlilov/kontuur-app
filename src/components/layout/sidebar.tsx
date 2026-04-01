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
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'

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

export function Sidebar({ agencyMode, pendingCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const agencyNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { label: 'Clients', href: '/clients', icon: <Users className="h-5 w-5" /> },
    { label: 'Generate posts', href: '/generate', icon: <Sparkles className="h-5 w-5" /> },
    {
      label: 'Review queue',
      href: '/review',
      icon: <ClipboardList className="h-5 w-5" />,
      badge: pendingCount,
    },
    { label: 'Calendar', href: '/calendar', icon: <Calendar className="h-5 w-5" /> },
    { label: 'Analytics', href: '/analytics', icon: <BarChart2 className="h-5 w-5" /> },
  ]

  const soloNav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { label: 'Create content', href: '/generate', icon: <Sparkles className="h-5 w-5" /> },
    {
      label: 'My drafts',
      href: '/review',
      icon: <ClipboardList className="h-5 w-5" />,
      badge: pendingCount,
    },
    { label: 'My calendar', href: '/calendar', icon: <Calendar className="h-5 w-5" /> },
    { label: 'My results', href: '/analytics', icon: <BarChart2 className="h-5 w-5" /> },
  ]

  const navItems = agencyMode === 'solo' ? soloNav : agencyNav

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    toast.info('Signed out')
    router.push('/login')
    router.refresh()
  }

  function NavLinks({ onClose }: { onClose?: () => void }) {
    return (
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                active
                  ? 'bg-brand-purple-light text-brand-purple'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="bg-brand-purple text-white text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 h-screen sticky top-0 border-r border-gray-200 bg-white px-3 py-4">
        {/* Logo */}
        <div className="flex items-center gap-2 px-2 mb-6">
          <div className="h-7 w-7 rounded-lg bg-brand-purple flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">P</span>
          </div>
          <span className="text-base font-semibold text-gray-900">PostFlow</span>
        </div>

        <NavLinks />

        {/* Bottom actions */}
        <div className="flex flex-col gap-1 mt-4 pt-4 border-t border-gray-100">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
              pathname.startsWith('/settings')
                ? 'bg-brand-purple-light text-brand-purple'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <Settings className="h-5 w-5" />
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors min-h-[44px] w-full text-left"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile hamburger button */}
      <button
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-white border border-gray-200 shadow-sm"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex flex-col w-64 h-full bg-white px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between px-2 mb-6">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-brand-purple flex items-center justify-center">
                  <span className="text-white text-xs font-bold">P</span>
                </div>
                <span className="text-base font-semibold text-gray-900">PostFlow</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <NavLinks onClose={() => setMobileOpen(false)} />

            <div className="flex flex-col gap-1 mt-4 pt-4 border-t border-gray-100">
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 min-h-[44px]"
              >
                <Settings className="h-5 w-5" />
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 min-h-[44px] w-full text-left"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
