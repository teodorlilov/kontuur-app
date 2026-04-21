'use client'

import { Button } from '@/components/ui/button'
import type { StepperState } from '@/types/pillar-sources'

interface ReviewStepProps {
  state: StepperState
  onSave: () => void
  onBack: () => void
}

export function ReviewStep({ state, onSave, onBack }: ReviewStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Review setup</h3>
        <p className="text-sm text-gray-500 mt-1">
          Here&apos;s a summary of the sources you configured.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
          Configured sources
        </p>
        <div className="flex flex-wrap gap-2">
          {state.selectedPages.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
              {state.selectedPages.length} website pages
            </span>
          )}
          {state.selectedRssFeeds.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
              {state.selectedRssFeeds.length} RSS feeds
            </span>
          )}
          {state.uploadedDocumentIds.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
              {state.uploadedDocumentIds.length} documents
            </span>
          )}
          <span className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
            Web search {state.webSearchEnabled ? 'on' : 'off'}
            {state.webSearchEnabled && state.webSearchIncludeDomains.length > 0 &&
              ` · ${state.webSearchIncludeDomains.length} preferred`}
            {state.webSearchEnabled && state.webSearchExcludeDomains.length > 0 &&
              ` · ${state.webSearchExcludeDomains.length} excluded`}
          </span>
          {state.selectedPages.length === 0 &&
            state.selectedRssFeeds.length === 0 &&
            state.uploadedDocumentIds.length === 0 &&
            !state.webSearchEnabled && (
              <span className="text-xs text-gray-400">No sources configured yet</span>
            )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        You can manage source details and pillar assignments any time from the sources page.
      </p>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onSave}>
          Finish setup
        </Button>
      </div>
    </div>
  )
}
