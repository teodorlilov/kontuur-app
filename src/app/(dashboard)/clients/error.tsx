'use client'

import { Button } from '@/components/ui/button'

export default function ClientsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <div className="p-6">
        <div className="bg-surface rounded-xl border border-line p-12 text-center">
          <p className="text-ink font-medium">Failed to load clients</p>
          <p className="text-sm text-text3 mt-1 mb-6">
            Something went wrong while fetching your clients. Please try again.
          </p>
          <Button onClick={reset} size="sm">
            Retry
          </Button>
        </div>
      </div>
    </>
  )
}
