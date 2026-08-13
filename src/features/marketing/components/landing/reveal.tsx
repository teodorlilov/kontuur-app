'use client'

import { cn } from '@/utils/cn'
import { useInView } from '../../hooks/use-in-view'

interface RevealProps {
  children: React.ReactNode
  /** Stagger within a group, in milliseconds. */
  delay?: number
  className?: string
}

/**
 * Fades a block up the first time it scrolls into view.
 *
 * The hidden state, the reduced-motion opt-out and the no-JavaScript fallback
 * all live in the `.reveal` rules in globals.css. This component only decides
 * *when* to add `.in`, which is the one thing CSS cannot do.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true })

  return (
    <div
      ref={ref}
      // A per-instance stagger is a computed value, which is the one case the
      // system allows an inline style. `.reveal` reads it as its delay.
      style={delay ? ({ '--d': `${delay}ms` } as React.CSSProperties) : undefined}
      className={cn('reveal', inView && 'in', className)}
    >
      {children}
    </div>
  )
}
