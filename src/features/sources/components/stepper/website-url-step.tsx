'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

interface WebsiteUrlStepProps {
  initialUrl: string
  onScanned: (url: string, sitemaps: string[], pages: string[]) => void
  onSkip: () => void
  onBack: () => void
}

export function WebsiteUrlStep({ initialUrl, onScanned, onSkip, onBack }: WebsiteUrlStepProps) {
  const [url, setUrl] = useState(initialUrl)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleScan() {
    if (!url.trim()) return
    setScanning(true)
    setError(null)
    try {
      const res = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) throw new Error('Failed to scan')
      const data = (await res.json()) as { pages?: string[]; sitemaps?: string[] }
      onScanned(url.trim(), data.sitemaps ?? [], data.pages ?? [])
    } catch {
      setError('Could not scan website. Check the URL and try again.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Website setup</h3>
        <p className="text-sm text-gray-500 mt-1">
          Enter the client&apos;s website URL to scan for pages.
        </p>
      </div>

      <Input
        label="Website URL"
        type="url"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={scanning}
      />

      {scanning && (
        <div className="flex items-center gap-3 py-4">
          <Spinner size="sm" />
          <p className="text-sm text-gray-500">Scanning website for sitemaps...</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Skip for now
          </button>
          <Button
            size="sm"
            onClick={() => { void handleScan() }}
            disabled={!url.trim() || scanning}
          >
            Scan website
          </Button>
        </div>
      </div>
    </div>
  )
}
