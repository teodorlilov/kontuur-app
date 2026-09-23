import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReviewDraft } from '@/components/draft-editing/types'

const mocks = vi.hoisted(() => ({ approvePost: vi.fn(), savePostCopy: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/components/draft-editing/approve-post', () => ({
  approvePost: (...args: unknown[]) => mocks.approvePost(...args),
  saveDraftCopy: (...args: unknown[]) => mocks.savePostCopy(...args),
}))
vi.mock('@/lib/rewrite-draft', () => ({ rewriteDraft: vi.fn() }))

import { ReviewView } from '../components/review/review-view'

/**
 * The focus-clamp effect, pinned.
 *
 * `review-view.tsx:116` carries the third of the three deliberate
 * `react-hooks/set-state-in-effect` suppressions (TECH-DEBT §4.1). Its job: when the
 * focused draft leaves the live set — approved, discarded — the stored id must stop
 * pointing at something that is gone.
 *
 * The reason this needs a rendering test rather than a node one is the same reason
 * §7.12 gives for the apply-style defect: the behaviour only exists across a re-render
 * with new props. `focused` falls back at render time, and the effect PERSISTS that
 * fallback; asserting the fallback alone would pass even if the effect were deleted.
 *
 * The presentational children are mocked down to the one thing this test reads — which draft
 * the work column is showing. They render Konva and own their own state; none of that is the
 * subject here.
 */
vi.mock('@/components/draft-editing/review-grid', () => ({
  ReviewGrid: () => <div data-testid="review-grid" />,
}))
vi.mock('@/components/draft-editing/draft-rail', () => ({
  DraftRail: () => <div data-testid="draft-rail" />,
}))
vi.mock('@/components/draft-editing/insight-panel', () => ({
  InsightPanel: () => <div data-testid="insight-panel" />,
}))
vi.mock('@/components/draft-editing/commitment-bar', () => ({
  CommitmentBar: () => <div data-testid="commitment-bar" />,
}))
vi.mock('@/components/draft-editing/schedule-dialog', () => ({
  ScheduleDialog: () => null,
}))
// The one child that reports something: which post is focused right now. Its prop is
// `post` (the PostData itself), not the whole draft — taken from WorkColumnProps rather
// than guessed, which is the difference between a mock and a fiction.
vi.mock('@/components/draft-editing/work-column', () => ({
  WorkColumn: ({ post }: { post: { id: string; caption: string } }) => (
    <div data-testid="work-column" data-draft-id={post.id}>
      {post.caption}
    </div>
  ),
}))

function draft(id: string, caption: string): ReviewDraft {
  return {
    post: { id, caption, post_type: 'single', slides_json: null, platform: 'Instagram' },
    scores: { overall_score: 8, human_score: 8, language_score: 8, source_score: null },
    // Only what this component reads; the cast documents the gap.
  } as unknown as ReviewDraft
}

const DRAFTS = [draft('a', 'Draft A'), draft('b', 'Draft B'), draft('c', 'Draft C')]

function renderView(over: Record<string, unknown> = {}) {
  return render(
    <ReviewView
      posts={DRAFTS}
      approvedIds={new Set<string>()}
      discardedIds={new Set<string>()}
      skipped={null}
      clientId="client-1"
      timeZone="Europe/Sofia"
      runContext={{
        clientName: 'Acme',
        postType: 'single',
        slideCount: 1,
        requestedCount: 3,
      }}
      destinations={['instagram']}
      visualsByDraft={{}}
      onRegenerateVisual={vi.fn()}
      onReplaceVisual={vi.fn()}
      onSavedImage={vi.fn()}
      onCopySaved={vi.fn()}
      onApproved={vi.fn()}
      onDiscarded={vi.fn().mockResolvedValue(true)}
      onRewritten={vi.fn()}
      onNewRun={vi.fn()}
      {...over}
    />
  )
}

/** Which draft the work column is showing, or null when it is not rendered. */
function focusedDraftId(): string | null {
  return screen.queryByTestId('work-column')?.getAttribute('data-draft-id') ?? null
}

beforeEach(() => {
  mocks.approvePost.mockReset().mockResolvedValue({ ok: true, data: { nowhereToGo: false } })
  mocks.savePostCopy.mockReset().mockResolvedValue({ ok: true, data: undefined })
})

describe('ReviewView approve', () => {
  it('approves every live draft through the one approve, to the networks it can reach', async () => {
    const user = userEvent.setup()
    const onApproved = vi.fn()
    renderView({ posts: [draft('a', 'Draft A'), draft('b', 'Draft B')], onApproved })

    await user.click(screen.getByRole('button', { name: 'Approve all 2' }))

    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(2))
    // Nobody typed into these drafts, so approve carries no copy to write — one action, not two.
    expect(mocks.approvePost).toHaveBeenNthCalledWith(1, 'a', null, null, ['instagram'])
    expect(onApproved).toHaveBeenCalledWith('a')
    expect(onApproved).toHaveBeenCalledWith('b')
  })

  it('a draft the row refused stays live', async () => {
    const user = userEvent.setup()
    const onApproved = vi.fn()
    mocks.approvePost.mockResolvedValue({ ok: false, error: 'Post not found' })
    renderView({ posts: [draft('a', 'Draft A'), draft('b', 'Draft B')], onApproved })

    await user.click(screen.getByRole('button', { name: 'Approve all 2' }))

    await waitFor(() => expect(mocks.approvePost).toHaveBeenCalledTimes(2))
    expect(onApproved).not.toHaveBeenCalled()
  })
})

describe('ReviewView skipped banner', () => {
  it("says what the run could not cover, in the run's own numbers", () => {
    // What a resumed group carries: the run stored this when it closed, so the reviewer opening
    // these drafts a day later is told why there are fewer of them than asked for. The shortfall
    // is the run's own number — counting the drafts on screen would report one that never
    // happened, since an approved draft has left the group.
    const { container } = renderView({
      posts: [draft('a', 'Draft A')],
      skipped: { names: ['Behind the scenes'], cost: 2 },
    })

    expect(screen.getByText('1 pillar skipped')).toBeInTheDocument()
    expect(screen.getByText('Behind the scenes')).toBeInTheDocument()
    expect(container.textContent).toContain('2 posts short of the 3 asked for')
  })

  it('a pillar that was allocated nothing did not shorten the run, and the copy says so', () => {
    const { container } = renderView({ skipped: { names: ['Tips'], cost: 0 } })

    expect(container.textContent).toContain('Nothing was allocated to it at this size')
    expect(container.textContent).not.toContain('short of')
  })

  it('shows nothing for a run that covered everything', () => {
    renderView({ skipped: null })
    expect(screen.queryByText(/pillar/)).not.toBeInTheDocument()
  })
})

describe('ReviewView focus clamp', () => {
  it('opens focused on the first draft', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByRole('button', { name: 'Focus' }))
    expect(focusedDraftId()).toBe('a')
  })

  it('a one-draft run opens straight in Focus', () => {
    renderView({ posts: [draft('solo', 'Only draft')] })
    // Documented default: the All grid's job is comparison, and one post has nothing
    // to compare.
    expect(screen.getByTestId('work-column')).toBeInTheDocument()
    expect(screen.queryByTestId('review-grid')).not.toBeInTheDocument()
  })

  it('moves focus off a draft that gets approved', async () => {
    const user = userEvent.setup()
    const { rerender } = renderView({ posts: [draft('a', 'Draft A'), draft('b', 'Draft B')] })

    // A two-draft run opens in the All grid, which does not mount the work column.
    // Focus is where the clamp is observable, so switch to it first.
    await user.click(screen.getByRole('button', { name: 'Focus' }))
    expect(focusedDraftId()).toBe('a')

    rerender(
      <ReviewView
        posts={[draft('a', 'Draft A'), draft('b', 'Draft B')]}
        approvedIds={new Set(['a'])}
        discardedIds={new Set<string>()}
        skipped={null}
        clientId="client-1"
        timeZone="Europe/Sofia"
        runContext={{
          clientName: 'Acme',
          postType: 'single',
          slideCount: 1,
          requestedCount: 2,
        }}
        destinations={['instagram']}
        visualsByDraft={{}}
        onRegenerateVisual={vi.fn()}
        onReplaceVisual={vi.fn()}
        onSavedImage={vi.fn()}
        onCopySaved={vi.fn()}
        onApproved={vi.fn()}
        onDiscarded={vi.fn().mockResolvedValue(true)}
        onRewritten={vi.fn()}
        onNewRun={vi.fn()}
      />
    )

    // The focused id must not still be 'a' — that draft is no longer live, and every
    // action in the work column would be aimed at something already approved.
    expect(focusedDraftId()).toBe('b')
  })

  it('survives every draft leaving the live set', () => {
    const { rerender } = renderView({ posts: [draft('a', 'Draft A')] })
    rerender(
      <ReviewView
        posts={[draft('a', 'Draft A')]}
        approvedIds={new Set(['a'])}
        discardedIds={new Set<string>()}
        skipped={null}
        clientId="client-1"
        timeZone="Europe/Sofia"
        runContext={{
          clientName: 'Acme',
          postType: 'single',
          slideCount: 1,
          requestedCount: 1,
        }}
        destinations={['instagram']}
        visualsByDraft={{}}
        onRegenerateVisual={vi.fn()}
        onReplaceVisual={vi.fn()}
        onSavedImage={vi.fn()}
        onCopySaved={vi.fn()}
        onApproved={vi.fn()}
        onDiscarded={vi.fn().mockResolvedValue(true)}
        onRewritten={vi.fn()}
        onNewRun={vi.fn()}
      />
    )
    // `liveDrafts[0]` is undefined here. The clamp must not throw, and the work column
    // must simply have nothing to show.
    expect(focusedDraftId()).toBeNull()
  })
})
