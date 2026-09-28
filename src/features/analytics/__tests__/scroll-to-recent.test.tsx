import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrollToRecent } from '../components/charts/scroll-to-recent'

describe('ScrollToRecent', () => {
  it('renders its children and leaves scrollLeft at 0 when nothing overflows (jsdom has no layout)', () => {
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
