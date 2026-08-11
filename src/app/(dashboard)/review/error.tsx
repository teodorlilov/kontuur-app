'use client'

import { RouteError } from '@/components/layout/route-error'

export default function ReviewError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="Failed to load review queue"
      description="Something went wrong while fetching posts. Please try again."
      reset={reset}
    />
  )
}
