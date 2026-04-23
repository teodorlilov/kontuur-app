'use client'

import { Button } from '@/components/ui/button'
import { Topbar } from '@/components/layout/topbar'

export default function ReviewError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <Topbar title="Review" />
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-900 font-medium">Failed to load review queue</p>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Something went wrong while fetching posts. Please try again.
          </p>
          <Button onClick={reset} size="sm">
            Retry
          </Button>
        </div>
      </div>
    </>
  )
}
