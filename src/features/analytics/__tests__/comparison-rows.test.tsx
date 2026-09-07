import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MIN_VISIBLE_PCT } from '../lib/compute/bar-scale'
import type { ComparisonRow } from '../lib/instagram/build-report'
import { ComparisonRows } from '../components/instagram/comparison-rows'

/** The extreme the floor exists for: a 32,340 paid row beside a previous period of 3. */
const ROWS: ComparisonRow[] = [
  {
    key: 'AD',
    label: 'Ads · paid',
    now: 32340,
    then: 3,
    meta: '0.3% engagement rate',
    details: [
      { label: 'Interactions', value: '103' },
      { label: 'Engagement rate', value: '0.3%' },
    ],
  },
  {
    key: 'CAROUSEL_CONTAINER',
    label: 'Carousels',
    now: 991,
    then: 222,
    meta: '8 published · 13.7% engagement rate',
    details: [
      { label: 'Posts published', value: '8' },
      { label: 'Interactions', value: '225' },
      { label: 'Engagement rate', value: '13.7%' },
    ],
  },
]

describe('ComparisonRows', () => {
  it('keeps a real value visible however small its share of the scale', () => {
    const { container } = render(<ComparisonRows rows={ROWS} ariaLabel="Reach by format" />)
    // 3 against a 32,340 maximum is 0.008% of the track (the span is 82). Asserted on the
    // rendered width, not on a utility class, so a restyle that keeps the behaviour passes.
    const bars = Array.from(container.querySelectorAll<HTMLElement>('i[style*="width"]'))
    expect(bars).toHaveLength(4)
    const widths = bars.map((bar) => Number.parseFloat(bar.style.width))
    expect(widths.every((width) => width >= MIN_VISIBLE_PCT)).toBe(true)
    // Floored, not inflated: the smallest bar stays visibly the smallest.
    expect(Math.min(...widths)).toBe(MIN_VISIBLE_PCT)
    expect(Math.max(...widths)).toBeGreaterThan(MIN_VISIBLE_PCT * 10)
  })

  it('raises a labeled card naming the reach, the posts and the rate', () => {
    const { container } = render(
      <ComparisonRows rows={ROWS} ariaLabel="Reach by format" unit="Reached" />
    )
    const carousels = container.querySelectorAll('.relative')[1]!
    fireEvent.pointerEnter(carousels)

    // Every number arrives under its own name — the point of the card.
    expect(screen.getByText('Reached this period')).toBeInTheDocument()
    // Once as the bar's inline value, once in the card.
    expect(screen.getAllByText('991')).toHaveLength(2)
    expect(screen.getByText('Reached last period')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
    expect(screen.getByText('+769')).toBeInTheDocument()
    expect(screen.getByText('Posts published')).toBeInTheDocument()
    expect(screen.getByText('Engagement rate')).toBeInTheDocument()
    expect(screen.getByText('13.7%')).toBeInTheDocument()

    fireEvent.pointerLeave(carousels)
    expect(screen.queryByText('Posts published')).not.toBeInTheDocument()
  })

  it('anchors a measured zero without drawing it a bar', () => {
    const zeroed: ComparisonRow[] = [
      { key: 'AD', label: 'Ads · paid', now: 62091, then: 0 },
      { key: 'POST', label: 'Posts', now: 347, then: null },
    ]
    const { container } = render(<ComparisonRows rows={zeroed} ariaLabel="Reach by format" />)
    // The zero gets a muted tick so its number is not left floating…
    const ticks = container.querySelectorAll('i.bg-line')
    expect(ticks).toHaveLength(1)
    // …and never a series-coloured bar, which would be indistinguishable from
    // the minimum width a genuinely small value carries.
    expect(container.querySelectorAll('i.bg-metric-3')).toHaveLength(0)
    // A null is absence, not zero: it earns no tick at all.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('cards a row that carries no count and no rate — Stories, in short windows', () => {
    const bare: ComparisonRow[] = [{ key: 'STORY', label: 'Stories', now: 972, then: 400 }]
    const { container } = render(<ComparisonRows rows={bare} ariaLabel="Reach by format" />)
    fireEvent.pointerEnter(container.querySelector('.relative')!)
    // No extras to add, but the reach and the change still deserve naming.
    expect(screen.getByText('Reached this period')).toBeInTheDocument()
    expect(screen.getByText('+572')).toBeInTheDocument()
  })

  it('leaves the compact line for print, which cannot be hovered', () => {
    render(<ComparisonRows rows={ROWS} ariaLabel="Reach by format" />)
    const printed = screen.getByText('8 published · 13.7% engagement rate')
    expect(printed.className).toContain('print:block')
    expect(printed.className).toContain('hidden')
  })

  it('reads the rows out of the chart itself, so the label and the bars cannot disagree', () => {
    render(<ComparisonRows rows={ROWS} ariaLabel="Reach by format" unit="Reached" />)
    const label = screen.getByRole('img').getAttribute('aria-label') ?? ''

    expect(label).toMatch(/^Reach by format\./)
    for (const row of ROWS) {
      expect(label).toContain(`${row.label} reached`)
    }
    expect(label).toContain('32,340 this period versus 3 last period')
  })

  it('reads an unmeasured value as unknown, never as a number the chart does not have', () => {
    render(
      <ComparisonRows
        rows={[{ key: 'k', label: 'Reels', now: null, then: 40 }]}
        ariaLabel="Reach by format"
      />
    )
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain(
      'Reels reached unknown this period versus 40 last period'
    )
  })
})
