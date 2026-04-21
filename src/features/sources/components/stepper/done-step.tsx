'use client'

import { Button } from '@/components/ui/button'

interface DoneStepProps {
  onComplete: () => void
}

export function DoneStep({ onComplete }: DoneStepProps) {
  return (
    <div className="flex flex-col items-center py-8 space-y-5">
      <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900">All set!</h3>
        <p className="text-sm text-gray-500 mt-1">
          Your source mapping is saved. You can always adjust sources from the client settings.
        </p>
      </div>

      <Button onClick={onComplete}>Go to sources</Button>
    </div>
  )
}
