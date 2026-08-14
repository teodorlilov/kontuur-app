'use client'

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { PostCard } from './post-card'
import { GhostSlot } from './ghost-slot'
import type { LaneItem } from '@/features/calendar/lib/week-model'

const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * The week below `md`: one day after another rather than seven columns.
 *
 * A different **layout**, not different **content** — it renders the same `PostCard` the
 * desktop lanes do. Growing its own card here is how a mobile view starts drifting from
 * the desktop one the first time a chip is added to either.
 *
 * Days with nothing are skipped entirely rather than rendered empty: on a narrow screen
 * a run of "Quiet" headings is scrolling with no information in it. The desktop grid
 * keeps its empty columns because their position carries meaning there.
 */
export const AgendaList = memo(function AgendaList({
  dayKeys,
  lanes,
  todayKey,
  timeZone,
  onPostClick,
  onSlotClick,
}: {
  dayKeys: string[]
  lanes: Map<string, LaneItem[]>
  todayKey: string
  timeZone: string
  onPostClick: (postId: string) => void
  onSlotClick: (slot: { clientName: string; at: string }) => void
}) {
  const daysWithPosts = dayKeys.filter((key) => (lanes.get(key) ?? []).length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 md:hidden">
      {daysWithPosts.length === 0 ? (
        <p className="m-auto px-4 text-center font-display text-body italic text-text3">
          Nothing scheduled this week.
        </p>
      ) : (
        daysWithPosts.map((dayKey, index) => {
          const [, month, day] = dayKey.split('-').map(Number)
          const isToday = dayKey === todayKey
          return (
            <section key={dayKey} className="flex flex-col gap-2">
              <h3
                className={cn(
                  'flex items-center gap-2 text-label font-semibold uppercase',
                  isToday ? 'text-forest' : 'text-text3'
                )}
              >
                {DOW_LONG[dayKeys.indexOf(dayKey)]} {day} {MONTHS[(month ?? 1) - 1]}
                {isToday && (
                  <span className="rounded-full bg-accent px-1.5 py-px text-label font-semibold tracking-normal text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)]">
                    Today
                  </span>
                )}
              </h3>
              {(lanes.get(dayKey) ?? []).map((item) =>
                item.kind === 'post' ? (
                  <PostCard
                    key={item.post.id}
                    post={item.post}
                    timeZone={timeZone}
                    onClick={onPostClick}
                  />
                ) : (
                  <GhostSlot
                    key={`${item.clientId}-${item.at}`}
                    clientName={item.clientName}
                    at={item.at}
                    missed={item.missed}
                    timeZone={timeZone}
                    onClick={onSlotClick}
                  />
                )
              )}
              {index < daysWithPosts.length - 1 && <hr className="mt-2 border-line" />}
            </section>
          )
        })
      )}
    </div>
  )
})
