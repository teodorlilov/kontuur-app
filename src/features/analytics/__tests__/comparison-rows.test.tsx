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
  it('keeps a real value visible however small its share of the scale, raising it to the floor and no further', () => {
    const { container } = render(<ComparisonRows rows={ROWS} ariaLabel="Reach by format" />)
    const bars = Array.from(container.querySelectorAll<HTMLElement>('i[style*="width"]'))
    expect(bars).toHaveLength(4)
    const widths = bars.map((bar) => Number.parseFloat(bar.style.width))
    expect(widths.every((width) => width >= MIN_VISIBLE_PCT)).toBe(true)
    expect(Math.min(...widths)).toBe(MIN_VISIBLE_PCT)
    expect(Math.max(...widths)).toBeGreaterThan(MIN_VISIBLE_PCT * 10)
  })

  it('raises a labeled card naming the reach (also printed beside its bar), the posts and the rate', () => {
    const { container } = render(
      <ComparisonRows rows={ROWS} ariaLabel="Reach by format" unit="Reached" />
    )
    const carousels = container.querySelectorAll('.relative')[1]!
    fireEvent.pointerEnter(carousels)

    expect(screen.getByText('Reached this period')).toBeInTheDocument()
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

  it('anchors a measured zero with a tick, never a bar, and gives a null no tick at all', () => {
    const zeroed: ComparisonRow[] = [
      { key: 'AD', label: 'Ads · paid', now: 62091, then: 0 },
      { key: 'POST', label: 'Posts', now: 347, then: null },
    ]
    const { container } = render(<ComparisonRows rows={zeroed} ariaLabel="Reach by format" />)
    const ticks = container.querySelectorAll('i.bg-line')
    expect(ticks).toHaveLength(1)
    expect(container.querySelectorAll('i.bg-metric-3')).toHaveLength(0)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('cards a row that carries no count and no rate — Stories, in short windows', () => {
    const bare: ComparisonRow[] = [{ key: 'STORY', label: 'Stories', now: 972, then: 400 }]
    const { container } = render(<ComparisonRows rows={bare} ariaLabel="Reach by format" />)
    fireEvent.pointerEnter(container.querySelector('.relative')!)
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
