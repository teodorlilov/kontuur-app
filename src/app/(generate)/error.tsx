'use client'

import { RouteError } from '@/components/layout/route-error'

export default function GenerateError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="The generate flow hit an error"
      description="No approved posts were lost — retry to start over."
      reset={reset}
    />
  )
}
