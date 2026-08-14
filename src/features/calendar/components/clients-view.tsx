'use client'

import { memo, useMemo } from 'react'
import { cn } from '@/utils/cn'
import { Avatar } from '@/components/ui/avatar'
import { PILL_TONES, type PillTone } from '@/components/ui/status-pill'
import { getWeekDayKeys, toDateKey } from '@/utils/date-helpers'
import { WEEKDAY_LABELS_SHORT as DOW_LABELS } from '@/utils/constants'
import {
  buildClientWeek,
  buildWeekLanes,
  type ClientWeek,
  type LaneClient,
} from '@/features/calendar/lib/week-model'
import { CoverageStrip } from './coverage-strip'
import type { ClientEntry } from '@/features/calendar/hooks/use-approval'
import type { CalendarPost } from '@/types/api'

/** Shared by the header labels and every row, so the two can never fall out of step. */
const ROW_GRID = 'md:grid-cols-[minmax(180px,1fr)_minmax(280px,2fr)_136px]'

/**
 * The week transposed: one row per client instead of one column per day.
 *
 * The week grid is organised by **day**, so answering "is this client covered?" means
 * scanning seven columns hunting for their monogram. This flips the axis so the answer
 * is one horizontal glance — and it is the only view that states a deficit, which is the
 * question the calendar could not previously answer at all.
 *
 * Reads the posts already in state and the cadence the page already loaded. No query.
 */
export const ClientsView = memo(function ClientsView({
  clients,
  laneClients,
  scheduledPosts,
  weekStartISO,
  timeZone,
}: {
  clients: ClientEntry[]
  laneClients: LaneClient[]
  scheduledPosts: CalendarPost[]
  weekStartISO: string
  timeZone: string
}) {
  const rows = useMemo(() => {
    // The same lanes the week grid draws, transposed — never rebuilt, or the two views
    // could disagree about which day a post near midnight belongs to, or about whether
    // a slot has passed.
    const lanes = buildWeekLanes({
      posts: scheduledPosts,
      clients: laneClients,
      weekStartISO,
      timeZone,
      now: new Date(),
    })
    return clients.map((client) => ({
      client,
      coverage: buildClientWeek({
        clientId: client.id,
        lanes,
        weekStartISO,
        target: client.posts_per_week,
      }),
    }))
  }, [clients, laneClients, scheduledPosts, weekStartISO, timeZone])

  // -1 whenever the viewed week is not the current one, which is the answer the labels
  // want: no day in it is today.
  const todayIndex = useMemo(
    () => getWeekDayKeys(weekStartISO).indexOf(toDateKey(new Date(), timeZone)),
    [weekStartISO, timeZone]
  )

  if (clients.length === 0) return null

  return (
    <div className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
      {/* Sticky, because a seventeen-client agency scrolls this list and a coverage strip
          with no weekday over it is seven anonymous chips. */}
      <div
        className={cn(
          'sticky top-0 z-[1] hidden flex-none items-center gap-4 bg-paper pb-1.5 pl-4 pr-3 pt-0.5 md:grid',
          ROW_GRID
        )}
      >
        <span className="text-label font-semibold uppercase text-text3">Client</span>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 px-1">
          {DOW_LABELS.map((day, index) => (
            <span
              key={day}
              className={cn(
                'text-center text-label font-semibold uppercase',
                // The Two Facts Rule at column scale: today is marked once, above the
                // strips, so no client's chip has to spend its own fill saying it.
                index === todayIndex ? 'text-forest' : 'text-text3'
              )}
            >
              {day}
            </span>
          ))}
        </div>
        <span className="text-right text-label font-semibold uppercase text-text3">This week</span>
      </div>

      {rows.map(({ client, coverage }) => (
        <ClientWeekRow
          key={client.id}
          name={client.name}
          coverage={coverage}
          timeZone={timeZone}
        />
      ))}
    </div>
  )
})

/**
 * How a verdict looks, in one place.
 *
 * The rail and the pill are the same judgement stated twice — at the edge of the row for
 * scanning a long list, and in words for reading one. Pairing them here is what stops
 * them drifting into two opinions about what counts as a problem.
 */
const VERDICT_TONE: Record<'deficit' | 'met' | 'unset', { rail: string; pill: PillTone }> = {
  // Amber, not clay: going dark is a state that needs attention, not a failure that
  // already happened.
  deficit: { rail: 'bg-pending', pill: 'warn' },
  met: { rail: 'bg-forest', pill: 'ok' },
  // Nobody has said what this client's week should be, so there is nothing to judge.
  unset: { rail: 'bg-line2', pill: 'neutral' },
}

function toneFor(verdict: ClientWeek['verdict']) {
  if (verdict === 'No cadence set') return VERDICT_TONE.unset
  if (verdict === 'On track') return VERDICT_TONE.met
  return VERDICT_TONE.deficit
}

/**
 * One client's week: who, the strip, and where they stand against their target.
 *
 * The deficit is carried by a **3px rail and a chip**, not by tinting the whole row.
 * Amber Background is a 4% wash — at row scale it reads as pale beige, and on an agency
 * where fifteen of seventeen clients are dark it floods the entire view, at which point
 * the colour has stopped distinguishing anything. Full-strength Amber (5.6:1) in two
 * small places says it louder than a wash over 1200px ever did.
 */
function ClientWeekRow({
  name,
  coverage,
  timeZone,
}: {
  name: string
  coverage: ClientWeek
  timeZone: string
}) {
  const tone = toneFor(coverage.verdict)
  const hasTarget = coverage.target > 0

  return (
    <div
      className={cn(
        // flex-none is load-bearing, not tidiness. These rows are flex items in a
        // scrolling column, and a flex item's automatic minimum size — the floor that
        // normally stops it shrinking below its own content — only applies while
        // `overflow` is visible. `overflow-hidden` (which the rail needs, to be clipped
        // by the rounded corner) sets that floor to zero, so seventeen rows squashed
        // themselves to fit the viewport and clipped the name and the verdict away.
        'relative grid flex-none grid-cols-1 items-center gap-3 overflow-hidden rounded-lg',
        'border border-line bg-surface py-2.5 pl-4 pr-3 md:gap-4',
        ROW_GRID
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', tone.rail)} />

      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={name} />
        <span className="min-w-0">
          <span className="block truncate text-body font-medium text-ink">{name}</span>
          {/* The cadence, and only the half a human set. `posts_per_week` is agency-set
              and can be stated flatly; the days and the hour come from a model's guess,
              so they appear as suggested times inside the hatched cells rather than as a
              pattern claimed here. */}
          <span className="block text-micro tabular-nums text-text3">
            {hasTarget ? `${coverage.target}× a week` : 'No cadence set'}
          </span>
        </span>
      </div>

      <CoverageStrip week={coverage.week} timeZone={timeZone} />

      <div className="flex items-center gap-2 md:flex-col md:items-end md:gap-1">
        <span className="text-caption font-semibold tabular-nums text-ink">
          {hasTarget ? `${coverage.filled} of ${coverage.target}` : `${coverage.filled} placed`}
        </span>
        <span
          className={cn(
            'flex-none rounded-chip px-2 py-0.5 text-micro font-medium',
            PILL_TONES[tone.pill]
          )}
        >
          {coverage.verdict}
        </span>
      </div>
    </div>
  )
}
