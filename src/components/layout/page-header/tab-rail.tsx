'use client'

import Link from 'next/link'
import { cn } from '@/utils/cn'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  count?: number
  /** Lime count — this is the tab that needs you today. */
  flag?: boolean
  /** Amber count — this tab holds something that needs care. */
  warn?: boolean
  /** Present on URL-driven rails; absent on rails backed by component state. */
  href?: string
}

interface TabRailProps<T extends string> {
  items: Array<TabItem<T>>
  active: T
  /** Omit for href-driven rails. Never both. */
  onSelect?: (id: T) => void
  /** Names the rail for screen readers — "Filter clients", "Client settings". */
  label: string
}

const TAB =
  'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 pb-[11px] ' +
  'text-body no-underline transition-colors duration-150 ease-contour first:pl-0'

const TAB_ACTIVE =
  'font-semibold text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 ' +
  "after:rounded-t-sm after:bg-forest after:content-[''] first:after:right-3.5"

/**
 * The header's third row: filters or sub-navigation.
 *
 * Its hairline is the boundary between chrome and content — the reason filters
 * stop floating between the header and the page. One component serves both
 * URL-driven rails (items carry `href`) and state-driven ones (`onSelect`).
 */
export function TabRail<T extends string>({ items, active, onSelect, label }: TabRailProps<T>) {
  return (
    <nav
      aria-label={label}
      className={cn(
        '-mb-px flex items-center gap-0.5 overflow-x-auto border-b border-line2',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      )}
    >
      {items.map((item) => {
        const isActive = item.id === active
        const content = (
          <>
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-[7px] py-px text-micro font-semibold tabular-nums',
                  item.flag
                    ? 'bg-accent text-forest-deep'
                    : item.warn
                      ? 'bg-pending-bg text-pending'
                      : 'bg-ink/[0.06] text-text2'
                )}
              >
                {item.count}
              </span>
            )}
          </>
        )

        return item.href ? (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(TAB, isActive ? TAB_ACTIVE : 'text-text2 hover:text-ink')}
          >
            {content}
          </Link>
        ) : (
          // Not role="tab": that requires a role="tablist" ancestor, and this is a
          // <nav>. These rails filter a list rather than swapping panels, so
          // aria-pressed states the same thing honestly — matching the href-driven
          // branch above, which uses aria-current for the same reason.
          <button
            key={item.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect?.(item.id)}
            className={cn(TAB, isActive ? TAB_ACTIVE : 'text-text2 hover:text-ink')}
          >
            {content}
          </button>
        )
      })}
    </nav>
  )
}
