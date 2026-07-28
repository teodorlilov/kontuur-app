'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { createSource } from '@/features/sources/actions/source-actions'
import { WHOLE_SITE_PAGE_CAP } from '@/features/sources/constants'

interface WebsiteConfirmStepProps {
  clientId: string
  websiteUrl: string
  selectedPages: string[]
  discoveredPages: string[]
  onSaved: () => void
  onSourceCreated?: (id: string) => void
  onBack: () => void
}

export function WebsiteConfirmStep({
  clientId,
  websiteUrl,
  selectedPages,
  discoveredPages,
  onSaved,
  onSourceCreated,
  onBack,
}: WebsiteConfirmStepProps) {
  const [saving, setSaving] = useState(false)

  // "Whole site" persists the discovered list (capped) so research samples
  // across the site — an empty selection would fetch only the homepage.
  const pagesToSave =
    selectedPages.length > 0 ? selectedPages : discoveredPages.slice(0, WHOLE_SITE_PAGE_CAP)

  async function handleSave() {
    setSaving(true)
    try {
      const result = await createSource(clientId, {
        type: 'website',
        label: new URL(websiteUrl).hostname,
        url: websiteUrl,
        selectedPages: pagesToSave.length > 0 ? pagesToSave : undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onSourceCreated?.(result.data.source.id)
      toast.success('Website source added')
      onSaved()
    } catch {
      toast.error('Failed to save website source')
    } finally {
      setSaving(false)
    }
  }

  let hostname = websiteUrl
  try {
    hostname = new URL(websiteUrl).hostname
  } catch {
    // keep raw URL
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Your website</h3>
        <p className="text-sm text-gray-500 mt-1">Review your selection before saving.</p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Website</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{hostname}</p>
          <p className="text-xs text-gray-400">{websiteUrl}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pages selected</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">
            {selectedPages.length > 0
              ? `${selectedPages.length} pages`
              : pagesToSave.length > 0
                ? `Whole site (${pagesToSave.length} pages)`
                : 'Homepage'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          size="sm"
          onClick={() => { void handleSave() }}
          loading={saving}
        >
          Save & continue
        </Button>
      </div>
    </div>
  )
}
