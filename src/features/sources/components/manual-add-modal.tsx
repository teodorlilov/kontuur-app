'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ManualAddInModalProps {
  onAdd: (label: string, url: string) => void
  isSaving: boolean
}

export function ManualAddInModal({ onAdd, isSaving }: ManualAddInModalProps) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Fitness News Weekly)"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/feed"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
      />
      <Button
        size="sm"
        loading={isSaving}
        disabled={!label.trim() || !url.trim()}
        onClick={() => onAdd(label, url)}
      >
        Add & Test
      </Button>
    </div>
  )
}
