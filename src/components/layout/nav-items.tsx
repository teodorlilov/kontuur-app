import {
  CalendarIcon,
  CaseRoundIcon,
  ChartIcon,
  ChatRoundIcon,
  ChatSquareIcon,
  ClipboardListIcon,
  SettingsIcon,
  StarsIcon,
  UsersGroupRoundedIcon,
  Widget2Icon,
} from '@solar-icons/react/line-duotone'
import type { Icon as Glyph } from '@solar-icons/react/lib/types'

/** Which live count a nav item shows as a badge, if any. */
export type NavBadge = 'pending' | 'ideas' | 'comments'

export interface NavItem {
  label: string
  href: string
  icon: Glyph
  badge?: NavBadge
}

const AGENCY_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Widget2Icon },
  { label: 'Clients', href: '/clients', icon: UsersGroupRoundedIcon },
  { label: 'Generate posts', href: '/generate', icon: StarsIcon },
  { label: 'Review queue', href: '/review', icon: ClipboardListIcon, badge: 'pending' },
  { label: 'Calendar', href: '/calendar', icon: CalendarIcon },
  // ChatRound, not ChatSquare — that one is Client ideas, directly below.
  { label: 'Comments', href: '/comments', icon: ChatRoundIcon, badge: 'comments' },
  { label: 'Client ideas', href: '/ideas', icon: ChatSquareIcon, badge: 'ideas' },
  { label: 'Analytics', href: '/analytics', icon: ChartIcon },
]

/**
 * "My business" points at /clients, not /clients/<id>/edit: the roster route sends a solo
 * workspace straight to its one business (src/app/(dashboard)/clients/page.tsx), and the prefix
 * keeps the row lit on both the settings and the sources pages.
 */
const SOLO_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Widget2Icon },
  { label: 'My business', href: '/clients', icon: CaseRoundIcon },
  { label: 'Create content', href: '/generate', icon: StarsIcon },
  { label: 'My drafts', href: '/review', icon: ClipboardListIcon, badge: 'pending' },
  { label: 'My calendar', href: '/calendar', icon: CalendarIcon },
  { label: 'My comments', href: '/comments', icon: ChatRoundIcon, badge: 'comments' },
  { label: 'My results', href: '/analytics', icon: ChartIcon },
]

export const SETTINGS_NAV_ITEM: NavItem = {
  label: 'Settings',
  href: '/settings',
  icon: SettingsIcon,
}

/** Nav items for a workspace mode, settings included. */
export function getNavItems(agencyMode: 'agency' | 'solo'): NavItem[] {
  return agencyMode === 'solo' ? SOLO_NAV : AGENCY_NAV
}

/** True when the current path is inside a nav item's section. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * Shared shape for every sidebar row, so the nav links, Notifications, Design
 * in Canva, and Sign out cannot drift apart. `collapsed` narrows to the icon.
 */
export const SIDEBAR_ROW =
  'flex w-full items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-left text-body ' +
  'transition-[color,background-color] duration-150 ease-contour'

export const SIDEBAR_ROW_IDLE = 'text-text2 hover:bg-ink/[0.04] hover:text-ink'
