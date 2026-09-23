import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { QueuePost } from '@/features/review/lib/queue-post'

/**
 * The queue's state machine, which is what this component actually is: triage over a live list of
 * rows, and three outcomes that each move the list before the server has answered — approve
 * (optimistic, rolled back on failure), discard (an undo window, committed on expiry or on
 * unmount) and the visuals a picture-painting cron may already be working on.
 *
 * The leaves are mocked down to the one thing each case reads. They render Konva, a date picker
 * and a dialog, and none of that is the subject: every assertion here is about a decision
 * ReviewQueue makes itself.
 */

const mocks = vi.hoisted(() => ({
  setPendingCount: vi.fn(),
  approvePost: vi.fn(),
  saveDraftCopy: vi.fn(),
  deletePost: vi.fn(),
  noteInFlight: vi.fn(),
  composeMissing: vi.fn(),
  generate: vi.fn(),
  recompose: vi.fn(),
  toastCustom: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastDismiss: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    custom: (...args: unknown[]) => mocks.toastCustom(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    dismiss: (...args: unknown[]) => mocks.toastDismiss(...args),
  },
}))
vi.mock('@/components/layout/shell-context', () => ({
  useShell: () => ({ setPendingCount: mocks.setPendingCount, timezone: 'Europe/Sofia' }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
// The page header's rail carries the notifications bell, which polls and routes. Nothing here
// is about it; the rest of the header (tabs, counts, the client filter) stays real.
vi.mock('@/components/layout/notifications-bell', () => ({ NotificationsBell: () => null }))
vi.mock('@/lib/actions/post-actions', () => ({
  deletePost: (...args: unknown[]) => mocks.deletePost(...args),
}))
vi.mock('@/components/draft-editing/approve-post', () => ({
  approvePost: (...args: unknown[]) => mocks.approvePost(...args),
  saveDraftCopy: (...args: unknown[]) => mocks.saveDraftCopy(...args),
}))
vi.mock('@/lib/rewrite-draft', () => ({ rewriteDraft: vi.fn() }))

/**
 * The visuals orchestrator, at its real surface. Mocked because the live hook reaches the
 * visuals route and pulls Konva in to bake text; what this file asserts is which of its
 * functions the queue calls, and with what.
 */
vi.mock('@/components/posts/use-generate-visuals', () => ({
  useGenerateVisuals: () => ({
    positionsFor: () => ({ generating: [], composing: [] }),
    slotsFor: () => [],
    noteInFlight: mocks.noteInFlight,
    pictureLanded: vi.fn(),
    generate: mocks.generate,
    recompose: mocks.recompose,
    composeMissing: mocks.composeMissing,
    replaceImage: vi.fn(),
    cancel: vi.fn(),
  }),
}))

vi.mock('@/components/draft-editing/work-column', () => ({
  WorkColumn: ({ post }: { post: { id: string } }) => (
    <div data-testid="work-column" data-post-id={post.id} />
  ),
}))
vi.mock('@/components/draft-editing/insight-panel', () => ({ InsightPanel: () => null }))
vi.mock('@/components/draft-editing/draft-rail', () => ({ DraftRail: () => null }))
vi.mock('@/components/scheduling/batch-schedule-modal', () => ({ BatchScheduleModal: () => null }))
vi.mock('./../send-to-client-dialog', () => ({ SendToClientDialog: () => null }))

/** The bar's two destructive affordances, which the focused view owns. */
vi.mock('@/components/draft-editing/commitment-bar', () => ({
  CommitmentBar: ({ onDiscard, onApproveNext }: Record<string, () => void>) => (
    <div>
      <button onClick={onDiscard}>Discard focused</button>
      <button onClick={onApproveNext}>Approve focused</button>
    </div>
  ),
}))

/** Confirming a slot is what runs the approve; the real dialog is a date picker. */
vi.mock('@/components/draft-editing/schedule-dialog', () => ({
  ScheduleDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: (at: string | null) => void
  }) => (open ? <button onClick={() => onConfirm(null)}>Confirm approve</button> : null),
}))

/** One row per card, carrying the two callbacks a card offers. */
vi.mock('./../triage-buckets', () => ({
  TriageBuckets: ({
    items,
    onOpen,
    onApprove,
  }: {
    items: Array<{ post: { id: string; caption: string | null } }>
    onOpen: (id: string) => void
    onApprove: (id: string) => void
  }) => (
    <div data-testid="bucket">
      {items.map(({ post }) => (
        <div key={post.id}>
          <button onClick={() => onOpen(post.id)}>Open {post.id}</button>
          <button onClick={() => onApprove(post.id)}>Approve {post.id}</button>
        </div>
      ))}
    </div>
  ),
}))
vi.mock('./../queue-insight-sections', () => ({ QueueInsightSections: () => null }))

import { ReviewQueue } from '../review-queue'

const NOW = '2026-08-04T12:00:00.000Z'

function image(position: number, fileName = `visual-${position}.jpg`) {
  return {
    id: `img-${position}`,
    publicUrl: `https://cdn/img-${position}.jpg`,
    storagePath: `c1/p/img-${position}.jpg`,
    position,
    fileName,
    fileSize: 10,
    contentType: 'image/jpeg',
  }
}

/** Clean scores and nothing flagged — a post that lands in "Ready to ship". */
function post(id: string, overrides: Partial<QueuePost> = {}): QueuePost {
  return {
    id,
    client_id: 'c1',
    caption: `Caption ${id}`,
    post_type: 'single',
    slides_json: null,
    validation_json: null,
    validation: {
      scores: { overall_score: 9, human_score: 9, language_score: 9, source_score: null },
      criteria: {
        ai_tells: [],
        worst_offending_phrase: null,
        source_claims: null,
        health_compliant: null,
        issues: [],
      },
      slop: { is_slop: false, ai_tells_found: [], human_authenticity_score: 9 },
    } as unknown as QueuePost['validation'],
    needsSlopCheck: false,
    destinations: ['instagram'],
    status: 'pending_review',
    priority: false,
    quality_score_avg: 9,
    was_rewritten: false,
    rewrite_count: 0,
    pillar: null,
    source_url: null,
    source_title: null,
    source_type: null,
    source_excerpt: null,
    topic_summary: null,
    scheduled_at: null,
    target_date: null,
    client_idea_id: null,
    generation_run_id: null,
    created_at: '2026-08-03T12:00:00.000Z',
    client_name: 'Bakery Sofia',
    is_health_niche: false,
    images: [image(0)],
    composedPositions: [0],
    generatingPositions: [],
    approval: null,
    ...overrides,
  }
}

function renderQueue(posts: QueuePost[]) {
  return render(
    <ReviewQueue
      initialPosts={posts}
      clients={[{ id: 'c1', name: 'Bakery Sofia' }]}
      weekSchedule={[]}
      postsPerWeekByClient={{ c1: 3 }}
      loadedAt={NOW}
    />
  )
}

/** Approve the card, then confirm the slot dialog it opens. */
async function approve(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(screen.getByRole('button', { name: `Approve ${id}` }))
  await user.click(screen.getByRole('button', { name: 'Confirm approve' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.approvePost.mockResolvedValue({ ok: true, data: { nowhereToGo: false } })
  mocks.deletePost.mockResolvedValue({ ok: true, data: undefined })
})

describe('ReviewQueue — triage', () => {
  it('sorts the queue into its three buckets and counts each', () => {
    renderQueue([
      post('ready-1'),
      post('attention-1', { images: [], composedPositions: [] }),
      post('waiting-1', {
        approval: { status: 'pending', expiresAt: '2026-08-06T12:00:00.000Z' },
      }),
    ])

    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Ready to ship/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Waiting on client/ })).toHaveTextContent('1')
    // A post with no picture yet is not ready, whatever it scored.
    expect(screen.getByRole('button', { name: 'Approve attention-1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve ready-1' })).not.toBeInTheDocument()
  })

  it('keeps the sidebar badge honest as the list settles', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [], composedPositions: [] })])
    expect(mocks.setPendingCount).toHaveBeenCalledWith(1)

    await approve(user, 'a')

    await waitFor(() => expect(mocks.setPendingCount).toHaveBeenLastCalledWith(0))
  })
})

describe('ReviewQueue — approve', () => {
  it('moves the card before the write answers, and says what it did', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [], composedPositions: [] })])

    await approve(user, 'a')

    expect(screen.queryByRole('button', { name: 'Approve a' })).not.toBeInTheDocument()
    expect(mocks.approvePost).toHaveBeenCalledWith('a', null, null, ['instagram'])
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Post approved')
  })

  it('puts the post back when the write refuses it', async () => {
    const user = userEvent.setup()
    mocks.approvePost.mockResolvedValue({ ok: false, error: 'Post not found' })
    renderQueue([post('a', { images: [], composedPositions: [] })])

    await approve(user, 'a')

    // The row never moved, so the queue must not keep claiming it did — every optimistic
    // caller of `schedulePosts` depends on a falsy result meaning exactly this.
    expect(await screen.findByRole('button', { name: 'Approve a' })).toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith('Approve failed — the post is back in the queue')
  })

  it('puts the post back when the write throws', async () => {
    const user = userEvent.setup()
    mocks.approvePost.mockRejectedValue(new Error('offline'))
    renderQueue([post('a', { images: [], composedPositions: [] })])

    await approve(user, 'a')

    expect(await screen.findByRole('button', { name: 'Approve a' })).toBeInTheDocument()
  })
})

describe('ReviewQueue — discard', () => {
  /** The undo toast the queue raised, rendered so its buttons can be pressed. */
  function discardToast() {
    const [render_, options] = mocks.toastCustom.mock.calls[0] as [
      () => ReactNode,
      { onAutoClose: () => void },
    ]
    return { element: render_(), options }
  }

  async function discard(user: ReturnType<typeof userEvent.setup>, id: string) {
    await user.click(screen.getByRole('button', { name: `Open ${id}` }))
    await user.click(screen.getByRole('button', { name: 'Discard focused' }))
  }

  it('takes the card away at once and deletes nothing until the window closes', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [], composedPositions: [] })])

    await discard(user, 'a')

    expect(screen.queryByRole('button', { name: 'Open a' })).not.toBeInTheDocument()
    expect(mocks.deletePost).not.toHaveBeenCalled()

    act(() => discardToast().options.onAutoClose())
    expect(mocks.deletePost).toHaveBeenCalledWith('a', undefined)
  })

  it('undo puts the post back and the row is never deleted', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [], composedPositions: [] })])
    await discard(user, 'a')

    render(discardToast().element)
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await screen.findByRole('button', { name: 'Open a' })).toBeInTheDocument()
    expect(mocks.deletePost).not.toHaveBeenCalled()
  })

  it('a reason picked in the window commits with it', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [], composedPositions: [] })])
    await discard(user, 'a')

    render(discardToast().element)
    await user.click(screen.getByRole('button', { name: 'Repetitive topic' }))

    expect(mocks.deletePost).toHaveBeenCalledWith('a', { reason: 'repetitive' })
  })

  it('leaving the page commits the discards still in their window', async () => {
    const user = userEvent.setup()
    const { unmount } = renderQueue([post('a', { images: [], composedPositions: [] })])
    await discard(user, 'a')

    // Otherwise a reviewer who dismissed a post and navigated away finds it waiting again.
    unmount()

    expect(mocks.deletePost).toHaveBeenCalledWith('a', undefined)
  })
})

describe('ReviewQueue — visuals somebody else is making', () => {
  /** A post that already has its picture is in "Ready to ship", not the default bucket. */
  async function openReady(user: ReturnType<typeof userEvent.setup>, id: string) {
    await user.click(screen.getByRole('button', { name: /Ready to ship/ }))
    await user.click(screen.getByRole('button', { name: `Open ${id}` }))
  }

  it("marks the server's claims as in flight, with the post the bake will need", () => {
    const waiting = post('a', { images: [], composedPositions: [], generatingPositions: [0] })
    renderQueue([waiting])

    expect(mocks.noteInFlight).toHaveBeenCalledWith(waiting, [0])
  })

  it('bakes the copy onto clean cron art once per post, not once per focus', async () => {
    const user = userEvent.setup()
    renderQueue([
      post('a', { images: [image(0)], composedPositions: [] }),
      post('b', { images: [image(0)], composedPositions: [0] }),
    ])

    await openReady(user, 'a')
    expect(mocks.composeMissing).toHaveBeenCalledTimes(1)
    expect(mocks.composeMissing).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), [
      expect.objectContaining({ position: 0 }),
    ])

    // Away to another post and back. Baking again would spend a second Konva pass and a second
    // storage PUT on a slide whose text is already on it.
    await user.click(screen.getByRole('button', { name: 'All posts' }))
    await user.click(screen.getByRole('button', { name: 'Open b' }))
    await user.click(screen.getByRole('button', { name: 'All posts' }))
    await user.click(screen.getByRole('button', { name: 'Open a' }))

    expect(mocks.composeMissing).toHaveBeenCalledTimes(1)
  })

  it('leaves a slide that already carries its text alone', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [image(0)], composedPositions: [0] })])

    await openReady(user, 'a')

    expect(mocks.composeMissing).not.toHaveBeenCalled()
  })

  it('never paints over a picture somebody uploaded', async () => {
    const user = userEvent.setup()
    renderQueue([post('a', { images: [image(0, 'holiday.jpg')], composedPositions: [] })])

    await openReady(user, 'a')

    expect(mocks.composeMissing).not.toHaveBeenCalled()
  })
})
