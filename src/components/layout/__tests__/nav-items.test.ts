import { describe, expect, it } from 'vitest'
import { getNavItems, isNavItemActive } from '../nav-items'

/**
 * The two navigation lists, pinned label by label.
 *
 * The agency list is the regression guard: a solo change must never move, rename or drop an
 * agency row. The solo list pins the one row that leads to the business — "My business" at
 * /clients — and the prefix match that keeps it lit on both the settings and sources pages.
 */
function summarise(mode: 'agency' | 'solo') {
  return getNavItems(mode).map(({ label, href, badge }) => ({ label, href, badge }))
}

describe('getNavItems', () => {
  it('keeps the agency list byte for byte', () => {
    expect(summarise('agency')).toEqual([
      { label: 'Dashboard', href: '/dashboard', badge: undefined },
      { label: 'Clients', href: '/clients', badge: undefined },
      { label: 'Generate posts', href: '/generate', badge: undefined },
      { label: 'Review queue', href: '/review', badge: 'pending' },
      { label: 'Calendar', href: '/calendar', badge: undefined },
      { label: 'Comments', href: '/comments', badge: 'comments' },
      { label: 'Client ideas', href: '/ideas', badge: 'ideas' },
      { label: 'Analytics', href: '/analytics', badge: undefined },
    ])
  })

  it('gives a solo workspace My business, right after the dashboard', () => {
    expect(summarise('solo')).toEqual([
      { label: 'Dashboard', href: '/dashboard', badge: undefined },
      { label: 'My business', href: '/clients', badge: undefined },
      { label: 'Create content', href: '/generate', badge: undefined },
      { label: 'My drafts', href: '/review', badge: 'pending' },
      { label: 'My calendar', href: '/calendar', badge: undefined },
      { label: 'My comments', href: '/comments', badge: 'comments' },
      { label: 'My results', href: '/analytics', badge: undefined },
    ])
  })
})

describe('isNavItemActive', () => {
  it('lights My business on both the settings and the sources page', () => {
    expect(isNavItemActive('/clients/c1/edit', '/clients')).toBe(true)
    expect(isNavItemActive('/clients/c1/sources', '/clients')).toBe(true)
    expect(isNavItemActive('/clients', '/clients')).toBe(true)
  })

  it('matches whole segments, not string prefixes', () => {
    expect(isNavItemActive('/clientsx', '/clients')).toBe(false)
    expect(isNavItemActive('/dashboard', '/clients')).toBe(false)
  })
})
