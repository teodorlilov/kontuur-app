'use client'

import { Select, ensureOption } from '@/components/ui/select'
import { WeekPreview } from '@/components/ui/week-preview'
import { GENERATION_HOUR_OPTIONS, POSTS_PER_RUN_OPTIONS, WEEKDAY_OPTIONS } from '@/utils/constants'
import type { DraftSchedule } from '@/features/onboarding/types'

/** "Mondays 09:00 · 3 a week" — the cadence as a sentence. */
export function formatSchedule(schedule: DraftSchedule): string {
  const day =
    WEEKDAY_OPTIONS.find((weekday) => weekday.value === schedule.day)?.label ?? schedule.day
  return `${day}s ${schedule.time} · ${schedule.count} a week`
}

export function ScheduleRead({ schedule }: { schedule: DraftSchedule }) {
  return <span className="text-ink">{formatSchedule(schedule)}</span>
}

/**
 * A cadence, not a date: posting repeats, so what there is to pick is a weekday, a time and a
 * count. Same three controls as the client settings Schedule tab, over the same `WeekPreview`, so
 * the two surfaces cannot drift.
 */
export function ScheduleEdit({
  schedule,
  onChange,
}: {
  schedule: DraftSchedule
  onChange: (schedule: DraftSchedule) => void
}) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          label="How many"
          value={schedule.count}
          onChange={(value) => onChange({ ...schedule, count: value })}
          options={POSTS_PER_RUN_OPTIONS}
        />
        <Select
          label="Generate on"
          value={schedule.day}
          onChange={(value) => onChange({ ...schedule, day: value })}
          options={[...WEEKDAY_OPTIONS]}
        />
        {/* Hour slots, not a free time input: the cron matches day + hour. `ensureOption`
            keeps a pre-change draft with minutes selectable; the payload snaps it on save. */}
        <Select
          label="Time"
          value={schedule.time}
          onChange={(value) => onChange({ ...schedule, time: value })}
          options={ensureOption(GENERATION_HOUR_OPTIONS, schedule.time)}
        />
      </div>
      <WeekPreview className="mt-3" day={schedule.day} count={parseInt(schedule.count, 10) || 0} />
    </div>
  )
}
