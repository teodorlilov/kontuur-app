'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { FetchStatus } from '@/features/sources/types'

interface ScanStepProps {
  initialUrl: string
  prescanStatus: FetchStatus
  prescannedPages: string[]
  /** Whether this stepper session already holds scan results (Back from the pages step). */
  alreadyScanned: boolean
  onScanRequested: (url: string) => void
  onScanned: (url: string, pages: string[]) => void
  onSkip: () => void
}

/**
 * Gate step for the website scan. The onboarding page owns the fetch; this
 * step only reflects its status and auto-advances when results are ready.
 */
export function ScanStep({
  initialUrl,
  prescanStatus,
  prescannedPages,
  alreadyScanned,
  onScanRequested,
  onScanned,
  onSkip,
}: ScanStepProps) {
  const [url, setUrl] = useState(initialUrl)
  const [requestedScan, setRequestedScan] = useState(false)

  let hostname = url
  try {
    hostname = new URL(url).hostname
  } catch {
    // keep raw input
  }

  // Advance as soon as the parent-owned scan lands. When the user came Back
  // to this step, only a freshly requested rescan advances again.
  useEffect(() => {
    if (prescanStatus === 'done' && (!alreadyScanned || requestedScan)) {
      onScanned(url.trim() || initialUrl, prescannedPages)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescanStatus, prescannedPages])

  function handleScan() {
    if (!url.trim()) return
    setRequestedScan(true)
    onScanRequested(url.trim())
  }

  if (prescanStatus === 'running') {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner size="md" />
          <p className="text-body text-text3">Scanning {hostname} for pages...</p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="text-body text-text3 hover:text-text2"
          >
            Skip website
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-sans text-display font-medium text-ink">Your website</h3>
        <p className="text-body text-text3 mt-1">
          We read your website to ground post ideas in your real content.
        </p>
      </div>

      <Input
        label="Website URL"
        type="url"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

      {prescanStatus === 'failed' && (
        <p className="text-body text-danger">
          We couldn&apos;t scan {hostname}. Check the URL or skip for now.
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-body text-text3 hover:text-text2"
        >
          Skip for now
        </button>
        <Button size="sm" onClick={handleScan} disabled={!url.trim()}>
          {prescanStatus === 'failed' ? 'Retry scan' : 'Scan website'}
        </Button>
      </div>
    </div>
  )
}
