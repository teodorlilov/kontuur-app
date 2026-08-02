'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * The sticky frame around the header rows, and the only thing that knows
 * whether the page has scrolled.
 *
 * Driven by an IntersectionObserver on a zero-height sentinel rather than a
 * scroll listener: the class flips once per stick/unstick instead of once per
 * scroll frame, which matters because the stuck state animates height, padding
 * and font-size.
 *
 * Children are passed through untouched, so a server-rendered header stays
 * server-rendered inside this client boundary.
 */
export function StickyShell({ children }: { children: ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry?.isIntersecting), {
      threshold: 0,
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <header
        data-stuck={isStuck}
        className={cn(
          'group/head sticky top-0 z-40 border-b border-transparent',
          // Frosted over the contour field rather than opaque, so the terrain
          // stays legible as content passes under it.
          'bg-paper/[0.84] backdrop-blur-[14px] backdrop-saturate-[1.3]',
          'transition-[border-color,box-shadow] duration-200 ease-contour',
          'data-[stuck=true]:border-line2 data-[stuck=true]:shadow-[0_10px_28px_-22px_rgba(15,21,18,0.5)]'
        )}
      >
        {children}
      </header>
    </>
  )
}
