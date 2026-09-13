import { MyWeekCard } from '@/features/dashboard/components/my-week-card'
import { buildMyWeekDays } from '@/features/dashboard/lib/my-week'
import { getCachedWeekPostPreviews } from '@/features/dashboard/queries/week-previews'
import type { WeekDay } from '@/lib/queries/week-coverage'

interface MyWeekProps {
  clientName: string
  week: WeekDay[]
  weekStartISO: string
  timeZone: string
  todayIndex: number
}

/**
 * The solo dashboard's week: the coverage the page already holds, plus a preview for each post on
 * it, rendered as `MyWeekCard`. Fetches only what the roster never needed — captions and first
 * images for at most seven posts — and only in solo mode, where this is rendered.
 */
export async function MyWeek({
  clientName,
  week,
  weekStartISO,
  timeZone,
  todayIndex,
}: MyWeekProps) {
  const ids = week.flatMap((day) => (day.postId ? [day.postId] : []))
  const previews = await getCachedWeekPostPreviews(ids)
  const days = buildMyWeekDays({ week, previews, weekStartISO, timeZone, todayIndex })
  return <MyWeekCard days={days} week={week} clientName={clientName} />
}
