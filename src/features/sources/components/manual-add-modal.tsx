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
        className="rounded-lg border border-line2 px-3 py-1.5 text-sm text-ink placeholder:text-text3 focus:border-spring focus:outline-none focus:ring-1 focus:ring-spring/12"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/feed"
        className="rounded-lg border border-line2 px-3 py-1.5 text-sm text-ink placeholder:text-text3 focus:border-spring focus:outline-none focus:ring-1 focus:ring-spring/12"
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
