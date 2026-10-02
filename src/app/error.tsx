'use client'

import { RouteError } from '@/components/layout/route-error'

/**
 * The fallback for any page or layout whose own route has no error page — the dashboard shell's,
 * the onboarding flow's — so a read that throws (src/lib/queries/cache.ts) ends on the app's own
 * retry, not Next's bare one.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="This page could not load"
      description="Something went wrong on our side. Please try again."
      reset={reset}
    />
  )
}
