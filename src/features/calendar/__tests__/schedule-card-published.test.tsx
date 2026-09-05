import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleCard } from '../components/schedule-card'
import type { CalendarPost } from '@/types/api'

/**
 * What a PUBLISHED post is allowed to offer.
 *
 * The card treated published as just another scheduled post, so a live post kept "Update
 * schedule" as its primary button — moving its slot while changing nothing on the network, which
 * put it on the calendar under a day it did not publish — and kept "Send for approval", which
 * emails a client an approval link for a post their followers have already seen.
 *
 * None of that is visible to typecheck, lint or any other suite: it is a rendering rule, and the
 * only thing that can hold it is a test that renders.
 */
vi.mock('@/hooks/use-canva-status', () => ({ useCanvaStatus: () => false }))
vi.mock('@/components/posts/use-generate-visuals', () => ({
  useGenerateVisuals: () => ({
    generatingPositions: [] as number[],
    composingPositions: [] as number[],
    generate: vi.fn(),
    recompose: vi.fn(),
  }),
}))
vi.mock('@/components/posts/image-slot', () => ({ ImageSlot: () => <div /> }))
vi.mock('@/features/canvas-editor/components/canvas-editor', () => ({
  CanvasEditor: () => <div />,
}))

const mocks = vi.hoisted(() => ({ duplicatePostAsDraft: vi.fn() }))
vi.mock('@/lib/actions/post-actions', () => ({
  duplicatePostAsDraft: mocks.duplicatePostAsDraft,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function publication(over: Record<string, unknown> = {}) {
  return {
    id: 'pub-1',
    platform: 'instagram',
    status: 'published',
    publishedAt: '2026-09-05T09:16:00.000Z',
    publishError: null,
    ...over,
  }
}

function makePost(over: Partial<CalendarPost> = {}): CalendarPost {
  return {
    id: 'post-1',
    client_id: 'client-1',
    caption: 'A published caption',
    post_type: 'single',
    status: 'scheduled',
    publications: [publication()],
    scheduled_at: '2026-09-05T06:00:00.000Z',
    slides_json: null,
    ...over,
  } as CalendarPost
}

function renderCard(post: CalendarPost, extra: Record<string, unknown> = {}) {
  return render(
    <ScheduleCard
      post={post}
      timeZone="Europe/Sofia"
      postIndex={0}
      totalPosts={1}
      isOpen
      onClose={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSchedule={vi.fn()}
      onUnschedule={vi.fn()}
      onSkip={vi.fn()}
      onDelete={vi.fn()}
      onSendApproval={vi.fn()}
      isScheduling={false}
      onImageUpserted={vi.fn()}
      onImageDeleted={vi.fn()}
      {...extra}
    />
  )
}

/** The live-links lookup the card makes when a published post opens. */
function resolveLinks(links: Array<{ platform: string; url: string | null }>) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ links }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  resolveLinks([])
  mocks.duplicatePostAsDraft.mockResolvedValue({ ok: true, data: { id: 'copy-1' } })
})

describe('a published post', () => {
  it('does not offer to reschedule or to send for approval', async () => {
    renderCard(makePost())

    expect(screen.queryByRole('button', { name: /update schedule/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /schedule to calendar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send for approval/i })).not.toBeInTheDocument()
    // Already correct before this change, and asserted so it stays that way.
    expect(screen.queryByRole('button', { name: /publish now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /unschedule/i })).not.toBeInTheDocument()
  })

  it('links out to the live post, as a real link', async () => {
    resolveLinks([{ platform: 'instagram', url: 'https://www.instagram.com/p/DcbRv5HCvif/' }])
    renderCard(makePost())

    const link = await screen.findByRole('link', { name: /view on instagram/i })
    // An anchor, not a button: an outbound destination wants cmd-click and the tab strip.
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/p/DcbRv5HCvif/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('says the post is gone rather than linking nowhere', async () => {
    // The state that made a stored permalink the wrong design: deleted on the network, so
    // there is nothing to link to and saying so beats a link into a 404.
    resolveLinks([{ platform: 'instagram', url: null }])
    renderCard(makePost())

    expect(await screen.findByText(/no longer on instagram/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view on/i })).not.toBeInTheDocument()
  })

  it('copies into a new draft instead of reopening the published one', async () => {
    renderCard(makePost())

    await userEvent.click(screen.getByRole('button', { name: /use again/i }))

    // The published post is the argument, never the thing edited: a new row is created and
    // this one keeps the ids the network knows it by.
    await waitFor(() => expect(mocks.duplicatePostAsDraft).toHaveBeenCalledWith('post-1'))
  })

  it('asks before deleting, and says the post stays up', async () => {
    const onDelete = vi.fn()
    renderCard(makePost(), { onDelete })

    await userEvent.click(screen.getByRole('button', { name: /delete post/i }))

    // Deleting drops the publications that comments and performance hang off, while the post
    // itself stays live — so it is a decision, not a click.
    expect(await screen.findByText(/stays live on instagram/i)).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /delete the record/i }))
    expect(onDelete).toHaveBeenCalledWith('post-1')
  })
})

describe('a post that has not gone out', () => {
  it('keeps every scheduling control', () => {
    // The other half of the gate: nothing above may leak into the normal flow.
    renderCard(makePost({ publications: [], status: 'scheduled' }))

    expect(screen.getByRole('button', { name: /update schedule/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send for approval/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /use again/i })).not.toBeInTheDocument()
    // No lookup is made for a post that never published.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
