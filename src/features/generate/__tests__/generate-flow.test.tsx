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

/**
 * The spies and values the `vi.mock` factories hand out. `draftVisuals` is one object across
 * renders, as the real hook's memoised value is.
 */
const mocks = vi.hoisted(() => {
  const enqueuePost = vi.fn()
  return {
    push: vi.fn(),
    refresh: vi.fn(),
    canPaint: vi.fn(),
    enqueuePost,
    deletePost: vi.fn(),
    linkGeneratedPost: vi.fn(),
    draftVisuals: {
      slotsFor: () => [],
      enqueuePost,
      regenerate: vi.fn(),
      replaceVisual: vi.fn(),
      recomposeDraft: vi.fn(),
      mergeImage: vi.fn(),
      abandonDraft: vi.fn(),
      discardDraft: vi.fn(),
      resetAll: vi.fn(),
    },
  }
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/actions/post-actions', () => ({
  deletePost: (...args: unknown[]) => mocks.deletePost(...args),
}))
vi.mock('@/features/ideas/actions/idea-actions', () => ({
  linkGeneratedPost: (...args: unknown[]) => mocks.linkGeneratedPost(...args),
}))
vi.mock('@/features/generate/hooks/use-draft-visuals', () => ({
  useDraftVisuals: ({ canPaint }: { canPaint: boolean }) => {
    mocks.canPaint(canPaint)
    return mocks.draftVisuals
  },
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
  ClientPicker: ({
    clients,
    onSelect,
  }: {
    clients: Array<{ id: string; name: string }>
    onSelect: (id: string) => void
  }) => (
    <div data-testid="client-picker">
      {clients.map((client) => (
        <button key={client.id} onClick={() => onSelect(client.id)}>
          Pick {client.name}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('../components/setup/run-panel', () => ({
  RunPanel: ({ onGenerate }: { onGenerate: () => void }) => (
    <button data-testid="run-panel" onClick={onGenerate}>
      Start the run
    </button>
  ),
}))

import { GenerateFlow } from '../components/generate-flow'
import { UNMETERED } from '@/lib/billing/plans'

/** An unmetered workspace: the flow's allowance is not what these cases are about. */
const UNLIMITED = { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED }
const NOTHING_USED = { draft: 0, image: 0, rewrite: 0 }
const NONE_OWED = { posts: 0, images: 0 }

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
      allowance={{ limits: UNLIMITED, committed: NOTHING_USED, owed: NONE_OWED }}
      gate={{ refusal: null, wayOut: true }}
      addClient={{ refusal: null, wayOut: true }}
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

  it("carries the resumed run's own record of what it asked for and skipped into the review, as the banner showed it live", () => {
    renderFlow({
      initialClientId: 'c1',
      waitingDrafts: [
        group('c1', ['a', 'b'], { targetCount: 4, skipped: { names: ['Tips'], cost: 2 } }),
      ],
    })

    const review = screen.getByTestId('review-view')
    expect(review).toHaveAttribute('data-skipped', 'Tips')
    expect(review).toHaveAttribute('data-requested', '4')
  })

  it('approving a resumed draft marks the idea it was written for generated, once, when only the drafts still know it', async () => {
    const user = userEvent.setup()
    renderFlow({ initialClientId: 'c1', waitingDrafts: [ideaGroup('c1', ['a', 'b'], 'i1')] })

    await user.click(screen.getByRole('button', { name: 'Approve a' }))
    expect(mocks.linkGeneratedPost).toHaveBeenCalledWith('i1', 'a')

    await user.click(screen.getByRole('button', { name: 'Approve b' }))
    expect(mocks.linkGeneratedPost).toHaveBeenCalledTimes(1)
  })

  it('a draft nobody asked for claims no idea', async () => {
    const user = userEvent.setup()
    renderFlow({ initialClientId: 'c1', waitingDrafts: [group('c1', ['a'])] })

    await user.click(screen.getByRole('button', { name: 'Approve a' }))
    expect(mocks.linkGeneratedPost).not.toHaveBeenCalled()
  })

  it('a waiting group of single images keeps its format after switching to a client whose default is carousel', async () => {
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
    expect(await screen.findByTestId('review-view')).toHaveTextContent('single')
    vi.unstubAllGlobals()
  })
})

describe('GenerateFlow — the allowance', () => {
  it('paints drafts while the raw image pool has any left, whatever the drafts pool says: owed pictures are what it is kept for', () => {
    const limits = { draft: 10, image: 10, rewrite: 5 }
    renderFlow({
      allowance: { limits, committed: { draft: 10, image: 0, rewrite: 0 }, owed: NONE_OWED },
    })
    expect(mocks.canPaint).toHaveBeenLastCalledWith(true)
    renderFlow({
      allowance: { limits, committed: { draft: 0, image: 10, rewrite: 0 }, owed: NONE_OWED },
    })
    expect(mocks.canPaint).toHaveBeenLastCalledWith(false)
  })

  it('refreshes the page after a refused run, so the counts shown are the server’s', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'You have 1 post left this period and this needs 3.' }),
      })
    )
    renderFlow()
    await user.click(screen.getByRole('button', { name: 'Start the run' }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it("returns to setup and says the run failed when a refusal carries no JSON body, like an edge 502's HTML page", async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    )
    renderFlow()
    await user.click(screen.getByRole('button', { name: 'Start the run' }))
    expect(toast.error).toHaveBeenCalledWith('Generation failed')
    expect(await screen.findByTestId('run-panel')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('clamps the count to the one single-image post one image left pays for, on first load and after a client switch', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            clientData: { id: 'c2', defaultPostType: 'single', defaultCarouselSlides: 5 },
            sources: [],
            connections: [],
          }),
      })
    )
    const limits = { draft: 100, image: 1, rewrite: 5 }
    renderFlow({ allowance: { limits, committed: NOTHING_USED, owed: NONE_OWED } })
    expect(screen.getByRole('button', { name: 'One post more' })).toBeDisabled()
    expect(screen.getByText('1 post left this period')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pick Atelier Nord' }))
    expect(await screen.findByRole('button', { name: 'One post more' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'One post fewer' })).toBeEnabled()
    vi.unstubAllGlobals()
  })
})

describe('no clients yet', () => {
  it('refuses Add your first client in place, with the reason and the way past it', () => {
    renderFlow({
      initialClients: [],
      addClient: { refusal: 'Choose a plan to add clients.', wayOut: true },
    })
    expect(screen.getByRole('button', { name: 'Add your first client' })).toBeDisabled()
    expect(screen.getByText(/Choose a plan to add clients\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan & billing' })).toBeInTheDocument()
  })

  it('refuses a member without sending them to Plan & billing', () => {
    renderFlow({
      initialClients: [],
      addClient: { refusal: 'Only admins can add or delete clients.', wayOut: false },
    })
    expect(screen.getByRole('button', { name: 'Add your first client' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Plan & billing' })).not.toBeInTheDocument()
  })
})
