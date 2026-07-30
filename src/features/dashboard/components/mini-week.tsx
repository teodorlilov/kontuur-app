import { cn } from '@/utils/cn'

interface MiniWeekProps {
  /** Filled slots per day, Monday first. */
  counts: number[]
  todayIndex: number
}

/** Seven bars sized by how many posts each day of the week carries. */
export function MiniWeek({ counts, todayIndex }: MiniWeekProps) {
  const busiest = Math.max(...counts, 1)

  return (
    <div className="mt-3.5 flex h-9 items-end gap-1.5">
      {counts.map((count, index) => {
        const isFilled = count > 0
        const isToday = index === todayIndex
        const height = isFilled ? 40 + (count / busiest) * 60 : 58

        return (
          <span
            key={index}
            className={cn(
              'flex-1 rounded-full',
              isToday && 'bg-accent',
              !isToday && isFilled && 'bg-white/85',
              // Hatching marks an open slot — nothing scheduled that day yet.
              // Same texture token the coverage chips use on dark surfaces.
              !isToday && !isFilled && 'slot-open-inv'
            )}
            // Bar height is the datum, so it is the one thing that stays inline.
            style={{ height: `${height}%` }}
          />
        )
      })}
    </div>
  )
}
