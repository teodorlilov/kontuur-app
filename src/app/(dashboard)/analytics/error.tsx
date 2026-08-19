'use client'

import { RouteError } from '@/components/layout/route-error'

export default function AnalyticsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="Failed to load analytics"
      description="The stored metrics could not be read — nothing has been lost. Please try again."
      reset={reset}
    />
  )
}
