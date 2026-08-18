import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewView } from '../components/review/review-view'
import type { ReviewDraft } from '@/components/posts/review/types'

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
 * The six presentational children are mocked down to the one thing this test reads —
 * which draft the work column is showing. They render Konva, fetch best-times and own
 * their own state; none of that is the subject here.
 */
vi.mock('@/components/posts/use-best-time', () => ({
  useBestTime: () => ({ bestTimeData: null }),
}))
vi.mock('@/components/posts/review/review-grid', () => ({
  ReviewGrid: () => <div data-testid="review-grid" />,
}))
vi.mock('@/components/posts/review/draft-rail', () => ({
  DraftRail: () => <div data-testid="draft-rail" />,
}))
vi.mock('@/components/posts/review/insight-panel', () => ({
  InsightPanel: () => <div data-testid="insight-panel" />,
}))
vi.mock('@/components/posts/review/commitment-bar', () => ({
  CommitmentBar: () => <div data-testid="commitment-bar" />,
}))
vi.mock('@/components/posts/review/schedule-dialog', () => ({
  ScheduleDialog: () => null,
}))
// The one child that reports something: which post is focused right now. Its prop is
// `post` (the PostData itself), not the whole draft — taken from WorkColumnProps rather
// than guessed, which is the difference between a mock and a fiction.
vi.mock('@/components/posts/review/work-column', () => ({
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
      skippedPillars={[]}
      allocation={[]}
      clientId="client-1"
      timeZone="Europe/Sofia"
      runContext={{
        clientName: 'Acme',
        platform: 'Instagram',
        postType: 'single',
        slideCount: 1,
        targetPostCount: 3,
      }}
      visualsByDraft={{}}
      onRegenerateVisual={vi.fn()}
      onReplaceVisual={vi.fn()}
      onEditedVisual={vi.fn()}
      onApproved={vi.fn()}
      onDiscarded={vi.fn()}
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
        skippedPillars={[]}
        allocation={[]}
        clientId="client-1"
        timeZone="Europe/Sofia"
        runContext={{
          clientName: 'Acme',
          platform: 'Instagram',
          postType: 'single',
          slideCount: 1,
          targetPostCount: 2,
        }}
        visualsByDraft={{}}
        onRegenerateVisual={vi.fn()}
        onReplaceVisual={vi.fn()}
        onEditedVisual={vi.fn()}
        onApproved={vi.fn()}
        onDiscarded={vi.fn()}
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
        skippedPillars={[]}
        allocation={[]}
        clientId="client-1"
        timeZone="Europe/Sofia"
        runContext={{
          clientName: 'Acme',
          platform: 'Instagram',
          postType: 'single',
          slideCount: 1,
          targetPostCount: 1,
        }}
        visualsByDraft={{}}
        onRegenerateVisual={vi.fn()}
        onReplaceVisual={vi.fn()}
        onEditedVisual={vi.fn()}
        onApproved={vi.fn()}
        onDiscarded={vi.fn()}
        onRewritten={vi.fn()}
        onNewRun={vi.fn()}
      />
    )
    // `liveDrafts[0]` is undefined here. The clamp must not throw, and the work column
    // must simply have nothing to show.
    expect(focusedDraftId()).toBeNull()
  })
})
