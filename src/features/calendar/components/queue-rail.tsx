'use client'

import { memo, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CONTROL_SURFACE, CONTROL_TEXT } from '@/components/ui/form/control-classes'
import { Listbox, type ListboxOption } from '@/components/ui/listbox'
import { groupQueue, type QueueSort } from '@/features/calendar/lib/queue-filter'
import { QueueItem } from './queue-item'
import type { CalendarPost } from '@/types/api'

/** One ordered list, so the menu cannot fall out of step with the sort vocabulary. */
const SORT_OPTIONS: ReadonlyArray<ListboxOption<QueueSort>> = [
  { value: 'score', label: 'Highest score' },
  { value: 'newest', label: 'Newest' },
  { value: 'client', label: 'By client' },
  { value: 'pillar', label: 'By pillar' },
]

/**
 * The backlog, docked beside the grid.
 *
 * Replaces a floating action button plus a slide-over that covered the calendar. That
 * pair had a dead end in it: the panel sat at `z-15` under a `z-40` sticky header, so its
 * own close button was buried, and it covered the `z-10` button that opened it. Once
 * open there was no way out.
 *
 * Docked instead of floating, so there is no stacking race to lose and nothing to
 * uncover — collapsing narrows the grid rather than revealing it.
 */
export const QueueRail = memo(function QueueRail({
  posts,
  totalCount,
  activePostId,
  clientFilterName,
  onPostClick,
}: {
  posts: CalendarPost[]
  /** Every unscheduled post, before the page's client filter. */
  totalCount: number
  activePostId: string | null
  /** Named when the grid's client filter is on, so the count can say what it counts. */
  clientFilterName: string | null
  onPostClick: (post: CalendarPost) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [priorityOnly, setPriorityOnly] = useState(false)
  const [sort, setSort] = useState<QueueSort>('score')

  const groups = useMemo(
    () => groupQueue(posts, { search, priorityOnly, sort }),
    [posts, search, priorityOnly, sort]
  )

  if (collapsed) {
    return (
      // Collapsed is a strip down the side of the grid on desktop and a bar across the
      // bottom on a phone — the same control, turned to face the axis it is stealing
      // space from.
      <aside
        className={cn(
          'flex w-full flex-none flex-row items-center gap-3 border-t border-line bg-surface px-3 py-2',
          'md:w-11 md:flex-col md:border-l md:border-t-0 md:px-0 md:py-3'
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={`Expand queue, ${totalCount} waiting to be scheduled`}
          className="grid size-7 flex-none place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-ink/[0.06] hover:text-ink"
        >
          <ChevronLeft className="size-3.5 rotate-90 md:rotate-0" />
        </button>
        <span className="order-last rounded-full bg-pending-bg px-1.5 py-0.5 text-micro font-semibold tabular-nums text-pending md:order-none">
          {totalCount}
        </span>
        <span
          aria-hidden="true"
          className="text-label font-semibold uppercase text-text2 md:[writing-mode:vertical-rl]"
        >
          Waiting
        </span>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Posts waiting to be scheduled"
      // Below md it sits under the week in the page's own scroll rather than beside it:
      // seven columns do not fit on a phone and neither does a 300px rail, and the
      // alternative — hiding it — left the backlog with no entry point at all.
      className={cn(
        'flex w-full flex-none flex-col border-t border-line bg-surface',
        'md:w-[300px] md:border-l md:border-t-0'
      )}
    >
      <div className="flex-none border-b border-line px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-body font-semibold text-ink">Waiting to be placed</h2>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse queue"
            className="ml-auto grid size-6 place-items-center rounded-sm text-text3 transition-colors duration-150 ease-contour hover:bg-ink/[0.06] hover:text-ink"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        {/* One count, stated once, naming what it counts. The panel this replaces showed
            an unfiltered total in its header and a filtered one in the sort row 40px
            below, so the two disagreed whenever a filter was on. */}
        <p className="mt-0.5 text-micro text-text3">
          {groups.matched === totalCount
            ? `All ${totalCount}`
            : `${groups.matched} of ${totalCount}`}
          {clientFilterName ? ` · ${clientFilterName}` : ''}
        </p>

        <div className="mt-2.5 flex items-center gap-1.5">
          <div className={cn(CONTROL_SURFACE, 'flex flex-1 items-center gap-1.5 px-2 py-1')}>
            <Search className="size-3 shrink-0 text-text2" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search waiting posts"
              className={cn(CONTROL_TEXT, 'w-full border-none bg-transparent text-ink outline-none')}
            />
          </div>
          <button
            type="button"
            onClick={() => setPriorityOnly((v) => !v)}
            aria-pressed={priorityOnly}
            className={cn(
              'flex-none rounded-sm px-2 py-1 text-micro font-medium transition-colors duration-150 ease-contour',
              priorityOnly
                ? 'bg-forest text-ink-inv'
                : 'border border-line2 bg-surface text-text2 hover:border-forest'
            )}
          >
            Priority
          </button>
        </div>

        {/* The system's Listbox, not a native <select>. A native menu is drawn by the
            OS, so it arrives in the platform's own type, radius and highlight colour —
            the one control on the page that no design decision reaches. */}
        <div className="mt-2 flex items-center gap-2 text-micro text-text3">
          <span>Sort</span>
          <Listbox
            value={sort}
            options={SORT_OPTIONS}
            onChange={setSort}
            label="Sort waiting posts"
            align="end"
            menuWidth="auto"
            renderTrigger={(selected, open) => (
              <button
                type="button"
                aria-expanded={open}
                className={cn(
                  'ml-auto inline-flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-0.5',
                  'text-micro font-medium transition-colors duration-150 ease-contour',
                  open ? 'bg-ink/[0.06] text-ink' : 'text-text2 hover:bg-ink/[0.06] hover:text-ink'
                )}
              >
                {selected?.label}
                <ChevronDown
                  size={12}
                  aria-hidden="true"
                  className={cn('transition-transform duration-150 ease-contour', open && 'rotate-180')}
                />
              </button>
            )}
          />
        </div>
      </div>

      {/* Its own scroller only where it is a pane. On a phone it is a section of the
          page, so it takes its natural height and the page scrolls it. */}
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {groups.matched === 0 ? (
          <p className="px-4 py-8 text-center font-display text-caption italic text-text3">
            {totalCount === 0 ? 'Nothing waiting.' : 'Nothing matches that.'}
          </p>
        ) : (
          <>
            <QueueGroup
              label="Priority"
              emphasis
              posts={groups.priority}
              {...{ activePostId, onPostClick }}
            />
            <QueueGroup label="Regular" posts={groups.regular} {...{ activePostId, onPostClick }} />
            <QueueGroup
              label="Not scored"
              posts={groups.unscored}
              {...{ activePostId, onPostClick }}
            />
          </>
        )}
      </div>
    </aside>
  )
})

/**
 * A section marker, not a table header.
 *
 * This was a full-width Sunken band with a chipped count in it, and at 300px wide that
 * is a heavy grey stripe interrupting the list every few rows — three of them turned the
 * rail into a stack of tables. The band is gone: the heading now sits on Surface and a
 * hairline runs from the count out to the edge, so it divides the list without weighing
 * on it. Still sticky and still opaque, because rows scroll underneath it.
 */
function QueueGroup({
  label,
  emphasis,
  posts,
  activePostId,
  onPostClick,
}: {
  label: string
  /**
   * Priority is the only group naming a flag the posts themselves carry, so it is the
   * only heading that takes colour — and it takes it as the word rather than as a
   * second amber object competing with the chips on the rows below.
   */
  emphasis?: boolean
  posts: CalendarPost[]
  activePostId: string | null
  onPostClick: (post: CalendarPost) => void
}) {
  if (posts.length === 0) return null
  return (
    <section>
      <h3 className="sticky top-0 z-[1] flex items-center gap-2 bg-surface px-4 pb-2 pt-3.5">
        <span
          className={cn(
            'text-label font-semibold uppercase',
            emphasis ? 'text-pending' : 'text-text3'
          )}
        >
          {label}
        </span>
        <span className="text-micro font-medium tabular-nums text-text3">{posts.length}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </h3>
      {posts.map((post) => (
        <QueueItem
          key={post.id}
          post={post}
          isActive={post.id === activePostId}
          onClick={onPostClick}
        />
      ))}
    </section>
  )
}
