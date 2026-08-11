'use client'

import { RouteError } from '@/components/layout/route-error'

export default function ClientsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="Failed to load clients"
      description="Something went wrong while fetching your clients. Please try again."
      reset={reset}
    />
  )
}
