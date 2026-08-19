'use client'

import { useEffect, useRef } from 'react'

/**
 * On viewports where the chart scrolls, land on the recent edge — the reader
 * came for what just happened, not for the oldest week.
 */
export function ScrollToRecent({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
