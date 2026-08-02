'use client'

import Link from 'next/link'
import { useShell } from '@/components/layout/shell-context'

export interface CrumbItem {
  label: string
  /** Omit on the final crumb — the page you are already on is not a link. */
  href?: string
}

/**
 * Breadcrumb for the header rail.
 *
 * Pages pass only the tail; the agency root is prepended here from context so
 * nine pages do not each have to fetch and thread the agency name. An empty
 * tail leaves the agency as the current page, which is what /dashboard wants.
 */
export function CrumbTrail({ items }: { items: CrumbItem[] }) {
  const { agencyName } = useShell()
  const trail: CrumbItem[] = [
    { label: agencyName || 'Workspace', href: items.length > 0 ? '/dashboard' : undefined },
    ...items,
  ]

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-caption">
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1
        return (
          <span key={`${crumb.label}-${index}`} className="contents">
            {index > 0 && (
              <span aria-hidden="true" className="text-line2">
                /
              </span>
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="whitespace-nowrap text-text3 no-underline transition-colors hover:text-forest"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className="truncate font-medium text-text2"
              >
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
