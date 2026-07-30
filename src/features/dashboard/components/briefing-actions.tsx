'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { generateBriefing } from '@/features/dashboard/actions/briefing-actions'

export function BriefingActions() {
  const [generating, setGenerating] = useState(false)
  const [fetchingTip, setFetchingTip] = useState(false)
  const [tip, setTip] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    try {
      const result = await generateBriefing()
      if (!result.ok) toast.error(result.error)
    } finally {
      setGenerating(false)
    }
  }

  async function handleGetTip() {
    if (tip) {
      setTip(null)
      return
    }
    setFetchingTip(true)
    try {
      const response = await fetch('/api/ai/intelligence/tip', { method: 'POST' })
      if (!response.ok) {
        toast.error('Could not fetch a tip right now.')
        return
      }
      const data = (await response.json()) as { tip?: string }
      setTip(data.tip ?? null)
    } finally {
      setFetchingTip(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex gap-2.5">
        <Button variant="secondary" size="sm" onClick={handleGenerate} loading={generating}>
          {generating ? 'Generating…' : 'Refresh briefing'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleGetTip} loading={fetchingTip}>
          {fetchingTip ? 'Getting tip…' : tip ? 'Hide tip' : 'Get a tip'}
        </Button>
      </div>
      {tip && (
        <p className="max-w-[46ch] rounded-chip bg-wash px-3 py-2 text-right text-[13px] text-forest">
          {tip}
        </p>
      )}
    </div>
  )
}
