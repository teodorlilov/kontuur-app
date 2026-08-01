import { cn } from '@/utils/cn'

/**
 * A clearing on the contour ground.
 *
 * Opaque with a hairline edge and NO shadow: on the near-white paper a white
 * card separates by 1.05:1, so depth comes from interrupting the terrain rather
 * than from elevation. See DESIGN.md § Surfaces.
 *
 * Padding is deliberately not baked in — the three consumers genuinely differ,
 * and forcing one value would trade real variation for false consistency.
 */
export function Card({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-card border border-ink/[0.05] bg-surface', className)}>
      {children}
    </div>
  )
}
