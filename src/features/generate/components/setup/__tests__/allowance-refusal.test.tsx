import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CountSteppers } from '../count-steppers'
import { RunPanel } from '../run-panel'
import { SetupView } from '../setup-view'
import { postsAffordable } from '@/lib/billing/post-allowance'
import type { Allowance } from '@/lib/billing/plans'

/**
 * What the setup step says before the server is asked. The arithmetic is `postsAffordable`'s own
 * test; these are the two controls sized by it — the ceiling the stepper offers and the button
 * that refuses — under each pool in turn.
 */

/** Round numbers, not the plan's: 60 drafts, 150 images. */
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
  it('a six-slide carousel is capped by its pictures, not its 60 drafts, and says so', () => {
    steppers(nothing, 6)
    expect(screen.getByText('25 posts left this period')).toBeInTheDocument()
  })

  it('the same period buys more single-image posts than carousels', () => {
    steppers(nothing, 1)
    expect(screen.getByText('60 posts left this period')).toBeInTheDocument()
  })

  it('names the pool that is empty — the pictures, not the 57 drafts still left', () => {
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

  it('refuses a run whose briefs alone are more than the format can pay for, with no researched posts', () => {
    render(
      <RunPanel
        runPlan={RUN_PLAN}
        postCount={0}
        briefCount={1}
        affordable={postsAffordable(TRIAL, used(0, 146), 5)}
        pool={{ left: 4, perPost: 5, owed: { posts: 0, images: 0 } }}
        metaLine="Carousel, 5 slides"
        clientId="c1"
        generating={false}
        onGenerate={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /Generate 1 post/ })).toBeDisabled()
    expect(
      screen.getByText(/You have 4 AI images left this period and this needs 5\./)
    ).toBeInTheDocument()
  })

  it('offers the run when both pools can pay for it', () => {
    panel(nothing, 6, 3)
    expect(screen.getByRole('button', { name: /Generate 3 posts/ })).toBeEnabled()
    expect(screen.getByText(/Nothing publishes from here/)).toBeInTheDocument()
  })
})

const PICKER_CLIENT = { id: 'c1', name: 'Bakery Sofia', niche: 'bakery', posts_per_week: 3 }

describe('the setup step keeps the form while a cheaper format still fits', () => {
  it('refuses a five-slide carousel on four images without replacing the form', () => {
    render(
      <SetupView
        clients={[PICKER_CLIENT]}
        clientId="c1"
        clientMeta=""
        clientLoading={false}
        postType="carousel"
        slideCount={5}
        postCount={1}
        affordable={postsAffordable(TRIAL, used(0, 146), 5)}
        gate={{ refusal: null, wayOut: true }}
        briefs={[]}
        runPlan={RUN_PLAN}
        generating={false}
        waiting={[]}
        onReviewWaiting={vi.fn()}
        onClientChange={vi.fn()}
        onPostTypeChange={vi.fn()}
        onSlideCountChange={vi.fn()}
        onPostCountChange={vi.fn()}
        onBriefsChange={vi.fn()}
        onGenerate={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'One post more' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate 1 post/ })).toBeDisabled()
  })

  it('gives way to the refusal when no run may start at all', () => {
    render(
      <SetupView
        clients={[PICKER_CLIENT]}
        clientId="c1"
        clientMeta=""
        clientLoading={false}
        postType="single"
        slideCount={5}
        postCount={1}
        affordable={postsAffordable(TRIAL, used(0, 150), 1)}
        gate={{
          refusal:
            '3 posts still waiting for pictures need 4 AI images; you have 0 left this period.',
          wayOut: true,
        }}
        briefs={[]}
        runPlan={RUN_PLAN}
        generating={false}
        waiting={[]}
        onReviewWaiting={vi.fn()}
        onClientChange={vi.fn()}
        onPostTypeChange={vi.fn()}
        onSlideCountChange={vi.fn()}
        onPostCountChange={vi.fn()}
        onBriefsChange={vi.fn()}
        onGenerate={vi.fn()}
      />
    )
    expect(screen.getByText(/3 posts still waiting for pictures/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'One post more' })).not.toBeInTheDocument()
  })
})
