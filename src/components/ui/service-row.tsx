import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * The shared pieces of a third-party service row: a square initials tile, and a link that starts
 * an OAuth flow.
 *
 * Used by both the client's Connected accounts panel and the workspace Integrations panel, so the
 * two cannot drift apart.
 */

/** The square initials mark for a service: IG, FB, C. */
export function ServiceTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-[38px] flex-none place-items-center rounded-panel bg-wash text-micro font-bold text-forest">
      {children}
    </span>
  )
}

/**
 * A link that reads as a primary action.
 *
 * An anchor rather than `Button`: starting OAuth is a real navigation to a route handler, which a
 * button would have to fake with `window.location`.
 */
export function ConnectLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex h-8 items-center rounded-md bg-forest px-3 text-stat-label font-medium text-surface',
        'transition-colors duration-150 ease-contour hover:bg-forest-deep',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
        className
      )}
    >
      {children}
    </a>
  )
}
