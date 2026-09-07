import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrollToRecent } from '../components/charts/scroll-to-recent'

describe('ScrollToRecent', () => {
  /**
   * jsdom has no layout, so scrollWidth === clientWidth === 0 — the effect must take the
   * "nothing to scroll" branch without touching scrollLeft.
   */
  it('renders its children and leaves an unscrollable container alone', () => {
    render(
      <ScrollToRecent className="overflow-x-auto">
        <p>chart</p>
      </ScrollToRecent>
    )
    const child = screen.getByText('chart')
    expect(child).toBeInTheDocument()
    expect(child.parentElement?.scrollLeft).toBe(0)
  })
})
