'use client'

import { RouteError } from '@/components/layout/route-error'

export default function CommentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RouteError
      title="Failed to load comments"
      description="Nothing anyone wrote has been lost — Instagram still holds every comment, and this page just could not read our copy. Please try again."
      reset={reset}
    />
  )
}
