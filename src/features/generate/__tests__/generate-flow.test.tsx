import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WaitingDrafts } from '@/features/generate/lib/waiting-drafts'
import type { EditorialPost } from '@/lib/posts/fetch-editorial-posts'

/**
 * Resume. Drafts are rows, so the flow's first decision is whether it opens on a run that is
 * already waiting: straight into review for the selected client's group, or on setup with one
 * row per other client that has some. The views under the flow are the subject of their own
 * tests; here they are reduced to what the flow hands them.
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  enqueuePost: vi.fn(),
  deletePost: vi.fn(),
  linkGeneratedPost: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/actions/post-actions', () => ({
  deletePost: (...args: unknown[]) => mocks.deletePost(...args),
}))
vi.mock('@/features/ideas/actions/idea-actions', () => ({
  linkGeneratedPost: (...args: unknown[]) => mocks.linkGeneratedPost(...args),
}))
vi.mock('@/features/generate/hooks/use-draft-visuals', () => ({
  useDraftVisuals: () => ({
    slotsFor: () => [],
    enqueuePost: mocks.enqueuePost,
    regenerate: vi.fn(),
    replaceVisual: vi.fn(),
    recomposeDraft: vi.fn(),
    mergeImage: vi.fn(),
    abandonDraft: vi.fn(),
    discardDraft: vi.fn(),
    resetAll: vi.fn(),
  }),
}))
vi.mock('../components/review/review-view', () => ({
  ReviewView: ({
    posts,
    runContext,
    skipped,
    onApproved,
  }: {
    posts: Array<{ post: { id: string } }>
    runContext: { clientName: string; postType: string; requestedCount: number }
    skipped: { names: string[]; cost: number } | null
    onApproved: (postId: string) => void
  }) => (
    <div
      data-testid="review-view"
      data-skipped={skipped?.names.join(',') ?? ''}
      data-requested={runContext.requestedCount}
    >
      {posts.length} drafts ready for {runContext.clientName} · {runContext.postType}
      {posts.map((draft) => (
        <button key={draft.post.id} onClick={() => onApproved(draft.post.id)}>
          Approve {draft.post.id}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('../components/setup/client-picker', () => ({
  ClientPicker: () => <div data-testid="client-picker" />,
}))
vi.mock('../components/setup/run-panel', () => ({
  RunPanel: () => <div data-testid="run-panel" />,
}))

import { GenerateFlow } from '../components/generate-flow'
import { UNMETERED } from '@/lib/billing/plans'

/** An unmetered workspace: the flow's allowance is not what these cases are about. */
const UNLIMITED = { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED }
const NOTHING_USED = { draft: 0, image: 0, rewrite: 0 }

const CLIENTS = [
  { id: 'c1', name: 'Bakery Sofia', niche: 'bakery', language: 'bg', posts_per_week: 3 },
  { id: 'c2', name: 'Atelier Nord', niche: 'design', language: 'en', posts_per_week: 2 },
]

function editorial(id: string, clientId: string): EditorialPost {
  return {
    post: {
      id,
      client_id: clientId,
      caption: `Draft ${id}`,
      post_type: 'single',
      slides_json: null,
      validation_json: null,
      status: 'draft',
      priority: false,
      scheduled_at: null,
      quality_score_avg: 8,
      was_rewritten: false,
      rewrite_count: 0,
      source_url: null,
      source_title: null,
      source_type: null,
      pillar: null,
      source_excerpt: null,
      client_source_id: null,
      topic_summary: null,
      target_date: null,
      client_idea_id: null,
      generation_run_id: null,
      created_at: '2026-09-19T08:00:00+00:00',
    },
    validation: {
      scores: { overall_score: 8, human_score: 8, language_score: 8, source_score: null },
      criteria: {
        ai_tells: [],
        worst_offending_phrase: null,
        source_claims: null,
        health_compliant: null,
        issues: [],
        structure_followed: null,
      },
      language: { passes: true, language_score: 8, issues: [], corrected_text: null },
      slop: { is_slop: false, ai_tells_found: [], human_score: 8 },
    } as unknown as EditorialPost['validation'],
    needsSlopCheck: false,
    images: [],
    composedPositions: [],
    generatingPositions: [],
  }
}

function group(clientId: string, ids: string[], run?: WaitingDrafts['run']): WaitingDrafts {
  return { clientId, run: run ?? null, posts: ids.map((id) => editorial(id, clientId)) }
}

/** The same group, written for an idea — what the stream route puts on every draft of that run. */
function ideaGroup(clientId: string, ids: string[], ideaId: string): WaitingDrafts {
  const waiting = group(clientId, ids)
  return {
    ...waiting,
    posts: waiting.posts.map((item) => ({
      ...item,
      post: { ...item.post, client_idea_id: ideaId },
    })),
  }
}

function renderFlow(over: Partial<Parameters<typeof GenerateFlow>[0]> = {}) {
  return render(
    <GenerateFlow
      timeZone="Europe/Sofia"
      allowance={{ limits: UNLIMITED, committed: NOTHING_USED }}
      initialClients={CLIENTS}
      initialClientData={null}
      initialTargetPostCount={3}
      initialSources={[]}
      initialConnections={[]}
      loadedAt="2026-09-20T09:00:00.000Z"
      {...over}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deletePost.mockResolvedValue({ ok: true, data: undefined })
  mocks.linkGeneratedPost.mockResolvedValue({ ok: true, data: undefined })
})

describe('GenerateFlow — resume', () => {
  it('opens straight into review when the selected client has drafts waiting, and finishes their visuals', () => {
    renderFlow({ initialClientId: 'c1', waitingDrafts: [group('c1', ['a', 'b', 'c'])] })

    expect(screen.getByTestId('review-view')).toHaveTextContent('3 drafts ready for Bakery Sofia')
    expect(mocks.enqueuePost).toHaveBeenCalledTimes(3)
    expect(mocks.enqueuePost).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), {
      images: [],
      composedPositions: [],
      generatingPositions: [],
    })
  })

  it("offers another client's waiting drafts as a row on setup, and opens them on request", async () => {
    const user = userEvent.setup()
    renderFlow({ initialClientId: 'c1', waitingDrafts: [group('c2', ['x'])] })

    expect(screen.queryByTestId('review-view')).not.toBeInTheDocument()
    expect(screen.getByText(/1 draft/)).toBeInTheDocument()
    expect(screen.getByText('Atelier Nord')).toBeInTheDocument()
    expect(screen.getByText(/from a run 1d ago/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review it' }))
    expect(screen.getByTestId('review-view')).toHaveTextContent('1 drafts ready for Atelier Nord')
    expect(mocks.enqueuePost).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }), {
      images: [],
      composedPositions: [],
      generatingPositions: [],
    })
  })

  it('a run from an idea opens on setup even when that client has drafts waiting', () => {
    renderFlow({
      initialIdea: {
        id: 'i1',
        clientId: 'c1',
        ideaText: 'Lip sync',
        extraNotes: null,
        targetDate: null,
        status: 'new',
      } as unknown as Parameters<typeof GenerateFlow>[0]['initialIdea'],
      waitingDrafts: [group('c1', ['a'])],
    })

    expect(screen.queryByTestId('review-view')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review it' })).toBeInTheDocument()
  })

  it("carries the resumed run's own account of itself into the review", () => {
    renderFlow({
      initialClientId: 'c1',
      waitingDrafts: [
        group('c1', ['a', 'b'], { targetCount: 4, skipped: { names: ['Tips'], cost: 2 } }),
      ],
    })

    // Two drafts of a run that asked for four, and the reason: the run recorded both when it
    // closed, so the banner says the same thing now as it did while the run was on screen.
    const review = screen.getByTestId('review-view')
    expect(review).toHaveAttribute('data-skipped', 'Tips')
    expect(review).toHaveAttribute('data-requested', '4')
  })

  it('approving a resumed draft marks the idea it was written for generated, once', async () => {
    const user = userEvent.setup()
    // No `initialIdea`: this session opened on /generate, days after the run. The drafts are the
    // only thing that still knows which idea asked for them.
    renderFlow({ initialClientId: 'c1', waitingDrafts: [ideaGroup('c1', ['a', 'b'], 'i1')] })

    await user.click(screen.getByRole('button', { name: 'Approve a' }))
    expect(mocks.linkGeneratedPost).toHaveBeenCalledWith('i1', 'a')

    // The second draft of the run carries the same idea; the first approval already fulfilled it.
    await user.click(screen.getByRole('button', { name: 'Approve b' }))
    expect(mocks.linkGeneratedPost).toHaveBeenCalledTimes(1)
  })

  it('a draft nobody asked for claims no idea', async () => {
    const user = userEvent.setup()
    renderFlow({ initialClientId: 'c1', waitingDrafts: [group('c1', ['a'])] })

    await user.click(screen.getByRole('button', { name: 'Approve a' }))
    expect(mocks.linkGeneratedPost).not.toHaveBeenCalled()
  })

  it('a waiting group keeps its own format after the client switch resolves', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            clientData: { id: 'c2', defaultPostType: 'carousel', defaultCarouselSlides: 6 },
            sources: [],
            connections: [],
          }),
      })
    )
    renderFlow({ initialClientId: 'c1', waitingDrafts: [group('c2', ['x'])] })

    await user.click(screen.getByRole('button', { name: 'Review it' }))
    // The group's drafts are single images; the client's carousel default must not relabel them.
    expect(await screen.findByTestId('review-view')).toHaveTextContent('single')
    vi.unstubAllGlobals()
  })
})
