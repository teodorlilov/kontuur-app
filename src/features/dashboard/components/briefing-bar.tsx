import { StarsIcon } from '@solar-icons/react/line-duotone'
import { Icon } from '@/components/ui/icon'
import { Card } from '@/components/ui/card'
import { IconChip } from '@/components/ui/icon-chip'
import { BriefingActions } from '@/features/dashboard/components/briefing-actions'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { cn } from '@/utils/cn'
import { formatLongDate, getMondayISO } from '@/utils/date-helpers'
import type { DashboardBriefing } from '@/features/dashboard/types'

/**
 * The one-line briefing bar at the foot of the dashboard: the week's first change as its italic
 * line, and the rest of the week behind "Show updates" on the right.
 *
 * The line is the only thing that changes between states; the bar's height never does. Both empty
 * lines are Latin, so only the headline — AI-written — goes through the Cyrillic gate the greeting
 * uses (DESIGN.md, Latin-Only Serif Rule).
 */
function headline(briefing: DashboardBriefing | null): string {
  if (!briefing) return 'No brief yet — one is written every Monday.'
  return briefing.items[0]?.title ?? 'Nothing changed on Instagram or Facebook this week.'
}

/** The week's platform brief, reduced to one line until the reader asks for the rest. */
export function BriefingBar({ briefing }: { briefing: DashboardBriefing | null }) {
  const line = headline(briefing)
  const hasItems = briefing !== null && briefing.items.length > 0

  return (
    <Card className="flex flex-wrap items-center gap-3.5 px-5 py-[18px]">
      <IconChip className="size-[27px] shrink-0 rounded-sm">
        <Icon glyph={StarsIcon} size="sm" />
      </IconChip>

      <div className="min-w-[220px] flex-1">
        <h2 className="text-title font-semibold text-ink">Weekly intelligence briefing</h2>
        <p
          className={cn(
            'mt-0.5 truncate text-display text-text2',
            hasCyrillic(line) ? 'font-sans not-italic' : 'font-display font-normal italic'
          )}
        >
          {line}
        </p>
      </div>

      {hasItems && (
        <BriefingActions
          items={briefing.items}
          weekLabel={formatLongDate(new Date(`${briefing.week_start}T00:00:00Z`), 'UTC')}
          isCurrentWeek={briefing.week_start === getMondayISO(new Date(), 'UTC')}
        />
      )}
    </Card>
  )
}
