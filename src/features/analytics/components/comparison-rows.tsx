'use client'

import { useState } from 'react'
import type { ComparisonRow } from '../lib/build-report'
import { formatCount } from '../lib/format'

interface ComparisonRowsProps {
  rows: ComparisonRow[]
  /** The chart restated in words — this element is one image to a reader. */
  ariaLabel: string
  /** What these rows measure — leads the hover card's own lines. */
  unit?: string
}

/** Bars stop at 82% so the printed value always has room at the row's end. */
const BAR_SPAN_PCT = 82

/**
 * The one paired-bar chart: a labeled row, this period's bar over last
 * period's thinner sage bar, both value-labeled. Formats, the taps funnel and
 * the follower flow all render through here — identity lives in the row label,
 * so every bar keeps one hue.
 *
 * Hovering a row raises its detail card. The facts that used to sit as a grey
 * fragment under the label live there instead, each one labeled, because
 * "8 published · 13.7% engagement rate" asked the reader to work out what
 * kind of thing each half was. Print keeps the fragment, since a printed
 * report cannot be hovered.
 */
export function ComparisonRows({ rows, ariaLabel, unit = 'Reached' }: ComparisonRowsProps) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(1, ...rows.flatMap((row) => [row.now ?? 0, row.then ?? 0]))
  return (
    <div role="img" aria-label={ariaLabel} className="mt-3 grid gap-3.5">
      {rows.map((row, index) => {
        return (
          <div
            key={row.key}
            className="relative grid grid-cols-[7.5rem_1fr] items-center gap-3.5"
            onPointerEnter={() => setHover(row.key)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="text-caption font-medium text-ink">
              {row.label}
              {/* Screen reads this from the card; paper has no hover. */}
              {row.meta && (
                <span className="hidden text-micro font-normal text-text3 print:block">
                  {row.meta}
                </span>
              )}
            </div>
            <div className="grid gap-[3px]">
              <div className="flex h-4 items-center">
                {row.now !== null && row.now > 0 && (
                  <i
                    // min-w keeps a real value visible: 3 against a 32,340
                    // maximum computes to 0.008% of the track, which is a bar
                    // the reader never sees beside a number they do.
                    className="block h-full min-w-[3px] rounded-r bg-forest"
                    // Computed width — the one truly dynamic style.
                    style={{ width: `${((row.now / max) * BAR_SPAN_PCT).toFixed(1)}%` }}
                  />
                )}
                {row.now === 0 && <ZeroTick />}
                <span className="ml-2 whitespace-nowrap text-micro font-medium tabular-nums text-ink">
                  {row.now === null ? '—' : formatCount(row.now)}
                </span>
              </div>
              <div className="flex h-2 items-center">
                {row.then !== null && row.then > 0 && (
                  <i
                    className="block h-full min-w-[3px] rounded-r bg-metric-3"
                    style={{ width: `${((row.then / max) * BAR_SPAN_PCT).toFixed(1)}%` }}
                  />
                )}
                {row.then === 0 && <ZeroTick />}
                <span className="ml-2 whitespace-nowrap text-micro tabular-nums text-text3">
                  {row.then === null ? '—' : formatCount(row.then)}
                </span>
              </div>
            </div>
            {/* Every row earns a card: its reach and change are worth naming
                even when no count or rate exists to add — Stories carry
                neither, and used to hover into nothing at all. */}
            {hover === row.key && (
              <RowCard row={row} unit={unit} above={index === rows.length - 1 && rows.length > 1} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The anchor a measured zero gets instead of a bar. A zero with nothing
 * beside it leaves its number floating at the track's origin, reading as a
 * rendering fault rather than as the value it is. Drawing a real bar would be
 * worse: it would be indistinguishable from the minimum width a genuinely
 * small number carries. So the tick is muted and stays at the origin — an
 * anchor, never a length.
 */
function ZeroTick() {
  return <i aria-hidden="true" className="block h-full w-[3px] rounded-r bg-line" />
}

/** The row's own numbers, each under a name. Decorative — the bars speak. */
function RowCard({ row, unit, above }: { row: ComparisonRow; unit: string; above: boolean }) {
  const change = row.now !== null && row.then !== null ? row.now - row.then : null
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute left-24 z-10 w-60 print:hidden ${
        above ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      <div className="rounded-panel border border-line bg-surface px-3.5 py-3 shadow-pop">
        <div className="text-micro font-semibold text-ink">{row.label}</div>
        <dl className="mt-1.5 space-y-1">
          <CardRow
            label={`${unit} this period`}
            value={row.now === null ? '—' : formatCount(row.now)}
          />
          <CardRow
            label={`${unit} last period`}
            value={row.then === null ? '—' : formatCount(row.then)}
          />
          {change !== null && (
            <CardRow
              label="Change"
              value={`${change >= 0 ? '+' : '−'}${formatCount(Math.abs(change))}`}
            />
          )}
          {row.details?.map((detail) => (
            <CardRow key={detail.label} label={detail.label} value={detail.value} />
          ))}
        </dl>
      </div>
    </div>
  )
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-micro text-text2">{label}</dt>
      <dd className="text-micro font-medium tabular-nums text-ink">{value}</dd>
    </div>
  )
}
