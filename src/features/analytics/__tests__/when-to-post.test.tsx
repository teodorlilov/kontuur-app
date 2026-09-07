import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AudienceOnline } from '../lib/instagram/build-report'
import { WhenToPost } from '../components/instagram/when-to-post'

/**
 * The shape `rankShade` exists for: a deep trough and a broad plateau, the curve its docblock
 * records from the probed account (sixteen of twenty-four hours within 30% of each other).
 * Under a value/max ramp every plateau hour lands in the top quarter of the scale.
 */
function realisticGrid(): number[][] {
  return Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: 24 }, (_, hour) => {
      if (hour < 6) return 20 + hour * 3
      const plateau = 250 + ((hour * 7 + weekday * 3) % 80)
      return plateau
    })
  )
}

const ONLINE: AudienceOnline = {
  grid: realisticGrid(),
  sampleDays: 12,
  peaks: [
    { weekday: 1, hour: 18, avg: 330 },
    { weekday: 1, hour: 16, avg: 320 },
    { weekday: 1, hour: 14, avg: 310 },
  ],
}

function cellOpacities(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>('i[style*="opacity"]')).map((node) =>
    Number(node.style.opacity)
  )
}

describe('WhenToPost', () => {
  /**
   * Every plateau hour sits above 0.75 of the max, so a value/max ramp would bunch them all in
   * the top quarter of the scale. Rank shading has to spread them out.
   */
  it('spends the ramp on the plateau instead of flattening it', () => {
    const { container } = render(<WhenToPost online={ONLINE} windows={[]} />)
    const plateau = cellOpacities(container).filter((opacity) => opacity > 0.4)
    expect(Math.max(...plateau) - Math.min(...plateau)).toBeGreaterThan(0.35)
  })

  /**
   * Both endpoints are the grid's real counts, so the reader can see how wide — or narrow — the
   * range the shading spends itself on actually is.
   */
  it('prints both ends of its own scale, so a flat week reads as flat', () => {
    const flat = ONLINE.grid.flat()
    render(<WhenToPost online={ONLINE} windows={[]} />)
    expect(screen.getByText(`~${Math.min(...flat)}`)).toBeInTheDocument()
    expect(screen.getByText(`~${Math.max(...flat)} online`)).toBeInTheDocument()
    expect(screen.getByText(/averaged over 12 days/)).toBeInTheDocument()
  })

  /** Before any hover, the panel names the busiest hours rather than standing empty. */
  it('reads out the hovered hour against the weekly average, without covering the grid', () => {
    const { container } = render(<WhenToPost online={ONLINE} windows={[]} />)
    expect(screen.getByText(/Tue 18:00/)).toBeInTheDocument()

    const cells = container.querySelectorAll('span[class*="h-5"]')
    fireEvent.pointerEnter(cells[0]!)
    expect(screen.getByText(/Monday 00:00/)).toBeInTheDocument()
    expect(screen.getByText(/followers online/)).toBeInTheDocument()
    expect(screen.getByText(/below your weekly average/)).toBeInTheDocument()
  })

  it('says so when the hourly picture is still collecting', () => {
    render(<WhenToPost online={null} windows={[]} />)
    expect(screen.getByText(/appears after about a week of nightly syncs/)).toBeInTheDocument()
  })
})
