import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleCard } from '../components/schedule-card'
import type { CalendarPost } from '@/types/api'

/**
 * "Publish now" reads the publish route's answer: the networks it reached on success, the route's
 * own sentence on a failure, and a fallback when the failure carries none — an edge page is not
 * JSON, and must not read as a dropped connection.
 */
vi.mock('@/hooks/use-canva-status', () => ({ useCanvaStatus: () => false }))
vi.mock('@/components/posts/use-generate-visuals', () => ({
  useGenerateVisuals: () => ({
    positionsFor: () => ({ generating: [] as number[], composing: [] as number[] }),
    generate: vi.fn(),
    recompose: vi.fn(),
    composeMissing: vi.fn(),
    replaceImage: vi.fn(),
    cancel: vi.fn(),
  }),
}))
vi.mock('@/components/posts/image-slot', () => ({ ImageSlot: () => <div /> }))
vi.mock('@/features/canvas-editor/components/canvas-editor', () => ({
  CanvasEditor: () => <div />,
}))
vi.mock('@/lib/actions/post-actions', () => ({ duplicatePostAsDraft: vi.fn() }))

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal('fetch', fetchMock)

/**
 * A scheduled post with a picture and nothing sent yet — the one "Publish now" is offered on.
 *
 * WHY as: only the fields the card reads are filled.
 */
function makePost(): CalendarPost {
  return {
    id: 'post-1',
    client_id: 'client-1',
    caption: 'A caption',
    post_type: 'single',
    status: 'scheduled',
    publications: [],
    destinations: ['instagram'],
    scheduled_at: '2026-09-05T06:00:00.000Z',
    slides_json: null,
    images: [
      {
        id: 'img-1',
        publicUrl: 'https://cdn/x.jpg',
        storagePath: 'p/x.jpg',
        position: 0,
        fileName: 'x.jpg',
        fileSize: 1,
        contentType: 'image/jpeg',
      },
    ],
  } as unknown as CalendarPost
}

function renderCard(handlers: { onClose?: () => void; onPublished?: () => void } = {}) {
  return render(
    <ScheduleCard
      post={makePost()}
      timeZone="Europe/Sofia"
      postIndex={0}
      totalPosts={1}
      isOpen
      onClose={handlers.onClose ?? vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSchedule={vi.fn()}
      onUnschedule={vi.fn()}
      onSkip={vi.fn()}
      onDelete={vi.fn()}
      isScheduling={false}
      onPublished={handlers.onPublished}
      onImageUpserted={vi.fn()}
      onImageDeleted={vi.fn()}
    />
  )
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('Publish now', () => {
  it('marks the post published on the networks the route reached, and closes', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, platforms: ['instagram'] }))
    const onClose = vi.fn()
    const onPublished = vi.fn()
    renderCard({ onClose, onPublished })

    await userEvent.setup().click(screen.getByRole('button', { name: /publish now/i }))

    await waitFor(() => expect(onPublished).toHaveBeenCalledWith('post-1', ['instagram']))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the route’s own sentence when it refuses', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: 'This client has no connected account that can take this post' },
        { status: 400 }
      )
    )
    renderCard()

    await userEvent.setup().click(screen.getByRole('button', { name: /publish now/i }))

    expect(
      await screen.findByText('This client has no connected account that can take this post')
    ).toBeInTheDocument()
  })

  it('falls back to its own words when the failure is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    renderCard()

    await userEvent.setup().click(screen.getByRole('button', { name: /publish now/i }))

    expect(await screen.findByText('Publish failed')).toBeInTheDocument()
  })
})
