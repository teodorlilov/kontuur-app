import Link from 'next/link'

interface RosterPaginationProps {
  /** How many rows the current page is hiding. */
  remaining: number
  /** Total across every page, for the "Show all N" label. */
  total: number
  showAllHref: string
  /** True once the page is already unpaginated. */
  showingAll: boolean
}

/**
 * A plain count and one escape hatch.
 *
 * No page numbers: the roster is sorted by urgency, so page 2 is "everything
 * that is fine" — a single destination rather than a sequence.
 */
export function RosterPagination({
  remaining,
  total,
  showAllHref,
  showingAll,
}: RosterPaginationProps) {
  if (showingAll || remaining <= 0) return null

  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-3 pb-1 pt-4">
      <p className="text-[12.5px] text-text3">
        {remaining} more {remaining === 1 ? 'client' : 'clients'} on schedule
      </p>
      <Link
        href={showAllHref}
        className="text-[13px] font-medium text-forest underline decoration-spring underline-offset-4 hover:text-forest-deep"
      >
        Show all {total}
      </Link>
    </div>
  )
}
