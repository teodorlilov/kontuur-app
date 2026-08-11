'use client'

import { RouteError } from '@/components/layout/route-error'

export default function IdeasError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="Failed to load client ideas"
      description="Nothing your clients sent has been lost — the list just could not be read. Please try again."
      reset={reset}
    />
  )
}
