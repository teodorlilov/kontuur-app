import { cn } from '@/utils/cn'
import { DAY_STATE_CLASSES } from '@/features/dashboard/lib/day-state-classes'

/** The three day states named beside their swatches; the graphics they explain carry no text. */
export function CoverageLegend() {
  return (
    <span className="flex items-center gap-3 text-micro text-text3">
      <span className="flex items-center gap-1.5">
        <i className={cn('size-2.5 rounded-[3.5px]', DAY_STATE_CLASSES.published)} />
        Published
      </span>
      <span className="flex items-center gap-1.5">
        <i className={cn('size-2.5 rounded-[3.5px]', DAY_STATE_CLASSES.scheduled)} />
        Scheduled
      </span>
      <span className="flex items-center gap-1.5">
        <i className={cn('size-2.5 rounded-[3.5px]', DAY_STATE_CLASSES.open)} />
        Open
      </span>
    </span>
  )
}
