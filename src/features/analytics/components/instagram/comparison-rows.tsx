'use client'

import { useState } from 'react'
import { barWidthPct } from '../../lib/compute/bar-scale'
import type { ComparisonRow } from '../../lib/instagram/build-report'
import { formatCount, signedCount } from '../../lib/compute/format'

interface ComparisonRowsProps {
  rows: ComparisonRow[]
  /**
   * What the chart IS — "Reach by format", "Link taps by button". The per-row readout is
   * appended from the rows themselves; a caller never writes it.
   */
  ariaLabel: string
  /** What these rows measure — leads the hover card's own lines. */
  unit?: string
}

/** Bars stop here so the value, printed inline after them, has room at the row's end. */
const BAR_SPAN_BEFORE_VALUE = 82

/**
 * The `role="img"` readout: what the chart is, then every row's pair. Built here, off the same
 * `rows` the bars are drawn from, so the spoken numbers cannot drift from the drawn ones —
 * a caller supplies only the name.
 */
function describeRows(rows: ComparisonRow[], ariaLabel: string, unit: string): string {
  const value = (amount: number | null) => (amount === null ? 'unknown' : formatCount(amount))
  const sentences = rows
    .map(
      (row) =>
        `${row.label} ${unit.toLowerCase()} ${value(row.now)} this period versus ${value(row.then)} last period`
    )
    .join('. ')
  return sentences ? `${ariaLabel}. ${sentences}.` : ariaLabel
}

/**
 * The one paired-bar chart, shared by the Instagram document's three row lists (reach by
 * format, interactions by kind, link taps by button): a labeled row, this period's bar over
 * last period's thinner one, both value-labeled. Identity lives in the row label, so every bar
 * keeps one hue.
 *
 * `row.details` names each fact in the hover card, because the compact `row.meta` fragment
 * ("8 published · 13.7% engagement rate") makes the reader work out what kind of thing each
 * half is. Print keeps the fragment — paper cannot be hovered.
 *
 * Both bars floor through `barWidthPct`: the live extreme is 3 against a 32,340 maximum, 0.008%
 * of the track, which would draw a bar the reader cannot see beside a number they can.
 * `comparison-rows.test.tsx` pins that case.
 */
export function ComparisonRows({ rows, ariaLabel, unit = 'Reached' }: ComparisonRowsProps) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(1, ...rows.flatMap((row) => [row.now ?? 0, row.then ?? 0]))
  return (
    <div role="img" aria-label={describeRows(rows, ariaLabel, unit)} className="mt-3 grid gap-3.5">
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
                    className="block h-full rounded-r bg-forest"
                    style={{
                      width: `${barWidthPct(row.now, max, BAR_SPAN_BEFORE_VALUE).toFixed(1)}%`,
                    }}
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
                    className="block h-full rounded-r bg-metric-3"
                    style={{
                      width: `${barWidthPct(row.then, max, BAR_SPAN_BEFORE_VALUE).toFixed(1)}%`,
                    }}
                  />
                )}
                {row.then === 0 && <ZeroTick />}
                <span className="ml-2 whitespace-nowrap text-micro tabular-nums text-text3">
                  {row.then === null ? '—' : formatCount(row.then)}
                </span>
              </div>
            </div>
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
 * What a measured zero gets instead of a bar. It stays at the origin and is never scaled: a
 * real bar at any width would be indistinguishable from the `MIN_VISIBLE_PCT` floor a
 * genuinely small number draws, which is the one distinction this chart must not lose.
 */
function ZeroTick() {
  return <i aria-hidden="true" className="block h-full w-[3px] rounded-r bg-line" />
}

/** aria-hidden: `describeRows` already speaks these numbers in the chart's own label. */
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
          {change !== null && <CardRow label="Change" value={signedCount(change)} />}
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
