import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CountSteppers } from '../count-steppers'
import { RunPanel } from '../run-panel'
import { postsAffordable } from '@/lib/billing/post-allowance'
import type { Allowance } from '@/lib/billing/plans'

/**
 * What the setup step says before the server is asked. The arithmetic is `postsAffordable`'s own
 * test; these are the two controls sized by it — the ceiling the stepper offers and the button
 * that refuses — under each pool in turn.
 */

/** A trial agency's three clients: 60 drafts, 150 images. */
const TRIAL: Allowance = { draft: 60, image: 150, rewrite: 45 }
const nothing: Allowance = { draft: 0, image: 0, rewrite: 0 }
const used = (draft: number, image: number): Allowance => ({ draft, image, rewrite: 0 })

const RUN_PLAN = {
  allocation: [],
  starvedPillars: [],
  webOnlyPillars: [],
  webResearchActive: true,
  publishState: { kind: 'connected' } as const,
}

function steppers(committed: Allowance, slides: number, postCount = 1) {
  render(
    <CountSteppers
      postCount={postCount}
      slideCount={slides}
      postType="carousel"
      postsPerWeek={3}
      briefCount={0}
      affordable={postsAffordable(TRIAL, committed, slides)}
      onPostCount={vi.fn()}
      onSlideCount={vi.fn()}
    />
  )
}

function panel(committed: Allowance, slides: number, postCount: number) {
  render(
    <RunPanel
      runPlan={RUN_PLAN}
      postCount={postCount}
      briefCount={0}
      affordable={postsAffordable(TRIAL, committed, slides)}
      metaLine="Carousel, 6 slides"
      clientId="c1"
      generating={false}
      onGenerate={vi.fn()}
    />
  )
}

describe('the setup step counts posts, not drafts', () => {
  it('a six-slide carousel is capped by its pictures, and says so', () => {
    // 150 images at six a post is 25 posts, while 60 drafts sit unspent.
    steppers(nothing, 6)
    expect(screen.getByText('25 posts left this period')).toBeInTheDocument()
  })

  it('the same period buys more single-image posts than carousels', () => {
    steppers(nothing, 1)
    expect(screen.getByText('60 posts left this period')).toBeInTheDocument()
  })

  it('names the pool that is empty — the pictures, not the drafts', () => {
    // 57 drafts left and no images: the old wording claimed the drafts were gone.
    steppers(used(3, 150), 6)
    expect(screen.getByText("You've used all your AI images for this period.")).toBeInTheDocument()
  })

  it('refuses a run that wants more posts than the period can pay for', () => {
    panel(used(0, 144), 6, 3)
    const button = screen.getByRole('button', { name: /Generate 3 posts/ })
    expect(button).toBeDisabled()
    expect(
      screen.getByText(/You have 1 post left this period and this needs 3\./)
    ).toBeInTheDocument()
  })

  it('offers the run when both pools can pay for it', () => {
    panel(nothing, 6, 3)
    expect(screen.getByRole('button', { name: /Generate 3 posts/ })).toBeEnabled()
    expect(screen.getByText(/Nothing publishes from here/)).toBeInTheDocument()
  })
})
