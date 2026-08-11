import { StatusPill, type PillTone } from '@/components/ui/status-pill'
import { formatDate } from '@/utils/format'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * How close a target date has to be before it stops being neutral information.
 *
 * A sibling of /review's AgeChip rather than a shared component: that measures how
 * long a draft has waited, this measures how long until a client's deadline. Same
 * shape, opposite direction, different thresholds — merging them would mean one
 * component with two modes and no clear name.
 */
const SOON_DAYS = 1

interface IdeaDueChipProps {
  /** 'YYYY-MM-DD' as the public form's date input produced it. */
  targetDate: string
  /**
   * Pinned by the server on render. Using `new Date()` here would make the chip
   * depend on the viewer's clock, so a tab left open overnight would silently
   * start reporting a different urgency than the page it sits on.
   */
  now: Date
}

/** Whether a client's target date is comfortably ahead, close, or already passed. */
export function IdeaDueChip({ targetDate, now }: IdeaDueChipProps) {
  const target = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null

  // Compared at day granularity: "due today" must not flip to "overdue" at noon.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((target.getTime() - startOfToday.getTime()) / MS_PER_DAY)

  const { tone, label }: { tone: PillTone; label: string } =
    days < 0
      ? { tone: 'bad', label: `Overdue ${Math.abs(days)}d` }
      : days === 0
        ? { tone: 'warn', label: 'Due today' }
        : days <= SOON_DAYS
          ? { tone: 'warn', label: 'Due tomorrow' }
          : { tone: 'neutral', label: `Due ${formatDate(target)}` }

  return <StatusPill tone={tone}>{label}</StatusPill>
}
