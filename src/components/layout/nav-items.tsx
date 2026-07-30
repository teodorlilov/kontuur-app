import {
  LayoutDashboard,
  Users,
  Sparkles,
  ClipboardList,
  Calendar,
  MessageSquare,
  BarChart2,
  Settings,
  type LucideIcon,
} from 'lucide-react'

/** Which live count a nav item shows as a badge, if any. */
export type NavBadge = 'pending' | 'ideas'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: NavBadge
}

export const AGENCY_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Generate posts', href: '/generate', icon: Sparkles },
  { label: 'Review queue', href: '/review', icon: ClipboardList, badge: 'pending' },
  { label: 'Calendar', href: '/calendar', icon: Calendar },
  { label: 'Client ideas', href: '/ideas', icon: MessageSquare, badge: 'ideas' },
  { label: 'Analytics', href: '/analytics', icon: BarChart2 },
]

export const SOLO_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Create content', href: '/generate', icon: Sparkles },
  { label: 'My drafts', href: '/review', icon: ClipboardList, badge: 'pending' },
  { label: 'My calendar', href: '/calendar', icon: Calendar },
  { label: 'My results', href: '/analytics', icon: BarChart2 },
]

export const SETTINGS_NAV_ITEM: NavItem = { label: 'Settings', href: '/settings', icon: Settings }

/** Nav items for a workspace mode, settings included. */
export function getNavItems(agencyMode: 'agency' | 'solo'): NavItem[] {
  return agencyMode === 'solo' ? SOLO_NAV : AGENCY_NAV
}

/** True when the current path is inside a nav item's section. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

/** Topbar title for the current route — the shell owns the title, not the page. */
export function resolveNavTitle(pathname: string, agencyMode: 'agency' | 'solo'): string {
  const candidates = [...getNavItems(agencyMode), SETTINGS_NAV_ITEM]
  // Longest href wins so nested routes resolve to their own section, not a prefix.
  const match = candidates
    .filter((item) => isNavItemActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
  return match?.label ?? 'Kontuur'
}
