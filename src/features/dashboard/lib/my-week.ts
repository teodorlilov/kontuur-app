import { WEEKDAY_LABELS_SHORT } from '@/utils/constants'
import { getWeekDayKeys, isoToDateTimeFields } from '@/utils/date-helpers'
import { toPreviewLine } from '@/utils/format'
import type { WeekDay } from '@/lib/queries/week-coverage'
import type { WeekPostPreview } from '@/features/dashboard/queries/week-previews'

/** One column of My week: the day's cap facts, its state, and the post the lane shows. */
export interface MyWeekDay {
  key: string
  label: string
  dayNumber: number
  isToday: boolean
  isPast: boolean
  state: WeekDay['state']
  /** Distinct posts on the day; the lane shows one and says when it is hiding more. */
  count: number
  post: { id: string; title: string; time: string; imageUrl: string | null } | null
}

interface BuildMyWeekInput {
  week: WeekDay[]
  previews: Record<string, WeekPostPreview>
  /** A 'YYYY-MM-DD' Monday — the week the seven days are keyed from. */
  weekStartISO: string
  timeZone: string
  /** Which column is today, Monday first — decided once by the page so no two marks disagree. */
  todayIndex: number
}

/**
 * Turns a client's week and the previews for its posts into the seven columns My week renders.
 *
 * The title is the caption's preview line — the dashboard's own rule, the one the drafts card
 * beside this uses — with the same guard: an empty or null caption reads "Untitled draft" rather
 * than reaching `toPreviewLine` unguarded. A day whose preview is missing (the previews read
 * degraded, or the post vanished between the two cached entries) still carries its state and
 * time; only the title and image are lost.
 */
export function buildMyWeekDays(input: BuildMyWeekInput): MyWeekDay[] {
  return getWeekDayKeys(input.weekStartISO).map((key, index) => {
    const day = input.week[index]
    const preview = day?.postId ? input.previews[day.postId] : undefined
    const post =
      day?.postId && day.at
        ? {
            id: day.postId,
            title: (preview?.caption && toPreviewLine(preview.caption)) || 'Untitled draft',
            time: isoToDateTimeFields(day.at, input.timeZone).time,
            imageUrl: preview?.imageUrl ?? null,
          }
        : null
    return {
      key,
      label: WEEKDAY_LABELS_SHORT[index] ?? '',
      dayNumber: Number(key.slice(8, 10)),
      isToday: index === input.todayIndex,
      isPast: index < input.todayIndex,
      state: day?.state ?? 'open',
      count: day?.count ?? 0,
      post,
    }
  })
}
