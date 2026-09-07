import { cn } from '@/utils/cn'

/**
 * Hatched absence (`slot-open` is the coverage strip's open-day hatch): a section holds the
 * space it will occupy rather than collapsing, so day one is not a shorter page.
 */
export function EmptyFill({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('slot-open grid min-h-24 place-items-center rounded-panel p-4', className)}>
      <span className="rounded-full bg-surface px-3 py-1 text-micro font-medium text-text2">
        {children}
      </span>
    </div>
  )
}
