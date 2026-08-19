'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { archiveReport } from '../actions/report-actions'
import { analyticsClientHref, analyticsRangeHref, analyticsWindowHref } from '../lib/analytics-href'
import { RANGE_PRESETS, type AnalyticsPeriod, type RangePreset } from '../lib/period'

const PRESET_LABELS: Record<RangePreset, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
}

interface MastheadControlsProps {
  clientId: string
  clients: Array<{ id: string; name: string }>
  period: AnalyticsPeriod
  hasHistory: boolean
}

/**
 * The operator chrome the print stylesheet leaves home: client scope, the
 * reporting period (the active range is the page's one lime — the standing
 * place in time), and Export, which archives the period then prints it.
 */
export function MastheadControls({ clientId, clients, period, hasHistory }: MastheadControlsProps) {
  const router = useRouter()
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(period.start)
  const [customTo, setCustomTo] = useState(period.end)
  const [exporting, startExport] = useTransition()
  // Server navigation takes a beat; without this the range buttons read as dead.
  const [navigating, startNavigate] = useTransition()

  function navigate(href: string): void {
    startNavigate(() => router.push(href))
  }

  function handleExport(): void {
    startExport(async () => {
      const result = await archiveReport({
        clientId,
        preset: period.preset,
        start: period.start,
        end: period.end,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
      window.print()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {clients.length > 1 && (
        <SelectControl
          label="Client"
          value={clientId}
          options={clients.map((client) => ({ value: client.id, label: client.name }))}
          onChange={(id) => navigate(analyticsClientHref(id, period))}
        />
      )}

      <div className="relative">
        <div
          role="group"
          aria-label="Reporting period"
          aria-busy={navigating}
          className={cn(
            'flex items-center gap-0.5 rounded-panel border border-line2 bg-surface p-0.5',
            'transition-opacity',
            navigating && 'pointer-events-none opacity-60'
          )}
        >
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={period.preset === preset}
              onClick={() => navigate(analyticsRangeHref(clientId, preset))}
              className={cn(RANGE_BUTTON, period.preset === preset && RANGE_ACTIVE)}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={period.preset === 'custom'}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
            className={cn(RANGE_BUTTON, period.preset === 'custom' && RANGE_ACTIVE)}
          >
            Custom
          </button>
        </div>

        {customOpen && (
          <form
            className="absolute right-0 top-full z-10 mt-2 flex items-end gap-2 rounded-panel border border-line bg-surface p-3 shadow-pop"
            onSubmit={(event) => {
              event.preventDefault()
              if (!customFrom || !customTo || customFrom > customTo) {
                toast.error('Pick a start that comes before the end')
                return
              }
              setCustomOpen(false)
              navigate(analyticsWindowHref(clientId, customFrom, customTo))
            }}
          >
            <label className="grid gap-1 text-micro font-medium text-text2">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="rounded-chip border border-line2 bg-surface px-2 py-1 text-caption text-ink"
              />
            </label>
            <label className="grid gap-1 text-micro font-medium text-text2">
              To
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="rounded-chip border border-line2 bg-surface px-2 py-1 text-caption text-ink"
              />
            </label>
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
          </form>
        )}
      </div>

      <Button
        variant="secondary"
        onClick={handleExport}
        disabled={!hasHistory}
        loading={exporting}
        title={hasHistory ? undefined : 'Nothing to export until the first sync tonight'}
      >
        Export report
      </Button>
    </div>
  )
}

const RANGE_BUTTON =
  'rounded-chip px-3 py-1 text-caption font-medium text-text2 transition-colors hover:bg-sunken'
// The one lime in the frame: where the reader stands in time. Lime is never
// empty — it carries Pine Deep type — and as a control it takes the 45% pine
// inset edge so its boundary clears 1.4.11 without leaning on hue.
const RANGE_ACTIVE =
  'bg-accent font-semibold text-forest-deep shadow-[inset_0_0_0_1px_rgba(12,46,32,0.45)] hover:bg-accent'
