'use client'

import { Button } from '@/components/ui/button'

/**
 * The shared body of a route group's error.tsx. Each route keeps its own
 * error.tsx file — Next.js requires the boundary to be the route segment's own
 * default export — but the markup lived four times and had already drifted in
 * class order between copies.
 */
export function RouteError({
  title,
  description,
  reset,
}: {
  title: string
  description: string
  reset: () => void
}) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-line bg-surface p-12 text-center">
        <p className="font-medium text-ink">{title}</p>
        <p className="mb-6 mt-1 text-body text-text3">{description}</p>
        <Button onClick={reset} size="sm">
          Retry
        </Button>
      </div>
    </div>
  )
}
