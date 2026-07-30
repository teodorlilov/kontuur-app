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
        const height = isFilled ? 40 + (count / busiest) * 60 : 58

        return (
          <span
            key={index}
            className={cn(
              'flex-1 rounded-full',
              index === todayIndex ? 'bg-accent' : isFilled ? 'bg-white/85' : 'bg-transparent'
            )}
            style={{
              height: `${height}%`,
              // Hatching marks an open slot — nothing scheduled that day yet.
              ...(isFilled || index === todayIndex
                ? undefined
                : {
                    background:
                      'repeating-linear-gradient(45deg, rgba(255,255,255,0.30) 0 2px, transparent 2px 5px)',
                  }),
            }}
          />
        )
      })}
    </div>
  )
}
