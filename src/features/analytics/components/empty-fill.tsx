import { cn } from '@/utils/cn'

/**
 * Hatched absence, the coverage-strip idiom: the space a section will occupy
 * holds its height before the first sync, with one quiet pill saying when.
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
