'use client'

import { useState } from 'react'
import { generateBriefing } from '@/features/dashboard/actions/briefing-actions'

export function BriefingActions() {
  const [generating, setGenerating] = useState(false)
  const [fetchingTip, setFetchingTip] = useState(false)
  const [tip, setTip] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    try {
      await generateBriefing()
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
      const res = await fetch('/api/ai/intelligence/tip', { method: 'POST' })
      if (res.ok) {
        const data = (await res.json()) as { tip?: string }
        setTip(data.tip ?? null)
      }
    } finally {
      setFetchingTip(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-xs font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          style={{ color: 'var(--color-terracotta)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--color-terracotta)' }}
        >
          {generating ? 'Generating…' : 'Refresh briefing'}
        </button>
        <button
          onClick={handleGetTip}
          disabled={fetchingTip}
          className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition-colors disabled:opacity-50"
        >
          {fetchingTip ? 'Getting tip…' : tip ? 'Hide tip' : 'Get a tip'}
        </button>
      </div>
      {tip && <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{tip}</p>}
    </div>
  )
}
