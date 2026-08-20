import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComparisonRow } from '../lib/build-report'
import { ComparisonRows } from '../components/comparison-rows'

/** The live shape: a huge paid row beside a previous period of 3. */
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
    // 3 against a 32,340 maximum computes to 0.008% of the track. Every bar
    // for a nonzero value must still carry a minimum width.
    const bars = Array.from(container.querySelectorAll<HTMLElement>('i[style*="width"]'))
    expect(bars).toHaveLength(4)
    expect(bars.every((bar) => bar.className.includes('min-w-'))).toBe(true)
  })

  it('raises a labeled card naming the reach, the posts and the rate', () => {
    const { container } = render(
      <ComparisonRows rows={ROWS} ariaLabel="Reach by format" unit="Reached" />
    )
    const carousels = container.querySelectorAll('.relative')[1]!
    fireEvent.pointerEnter(carousels)

    // Every number arrives under its own name — the point of the card.
    expect(screen.getByText('Reached this period')).toBeInTheDocument()
    // Once on the bar, once in the card beneath its label.
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

  it('leaves the compact line for print, which cannot be hovered', () => {
    render(<ComparisonRows rows={ROWS} ariaLabel="Reach by format" />)
    const printed = screen.getByText('8 published · 13.7% engagement rate')
    expect(printed.className).toContain('print:block')
    expect(printed.className).toContain('hidden')
  })
})
