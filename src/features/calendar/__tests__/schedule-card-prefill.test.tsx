import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleCard } from '../components/schedule-card'
import type { CalendarPost } from '@/types/api'

/**
 * Pins the pre-fill effect: when `post` changes, every field re-seeds from it, so the form never
 * shows the previous post's values under the current post's header. Only the leaves that reach
 * the network or the canvas are mocked; the effect under test is the component's own.
 */
vi.mock('@/hooks/use-canva-status', () => ({
  useCanvaStatus: () => false,
}))
// `positionsFor` answers arrays, as the real hook does: `missingPositions` iterates them.
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
vi.mock('@/components/posts/image-slot', () => ({
  ImageSlot: () => <div data-testid="image-slot" />,
}))
vi.mock('@/features/canvas-editor/components/canvas-editor', () => ({
  CanvasEditor: () => <div data-testid="canvas-editor" />,
}))

/** Sofia is UTC+3 in September (summer time), so 06:00Z seeds 09:00 and 07:30Z seeds 10:30. */
const ZONE = 'Europe/Sofia'

/**
 * A calendar post with nothing published yet (`publications: []`). WHY as: only the fields these
 * tests need are populated; the cast covers the rest.
 */
function makePost(over: Partial<CalendarPost> = {}): CalendarPost {
  return {
    id: 'post-1',
    client_id: 'client-1',
    caption: 'First caption',
    platform: 'Instagram',
    post_type: 'single',
    status: 'pending',
    publications: [],
    scheduled_at: '2026-09-01T06:00:00.000Z',
    slides_json: null,
    ...over,
  } as CalendarPost
}

function renderCard(post: CalendarPost, extra: Record<string, unknown> = {}) {
  return render(
    <ScheduleCard
      post={post}
      timeZone={ZONE}
      postIndex={0}
      totalPosts={2}
      isOpen
      onClose={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSchedule={vi.fn()}
      onUnschedule={vi.fn()}
      onSkip={vi.fn()}
      onDelete={vi.fn()}
      isScheduling={false}
      onImageUpserted={vi.fn()}
      onImageDeleted={vi.fn()}
      {...extra}
    />
  )
}

const dateField = () => screen.getByLabelText('Date') as HTMLInputElement
const timeField = () => screen.getByLabelText('Time') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ScheduleCard pre-fill', () => {
  it('seeds date and time from the post, both in the agency zone', () => {
    renderCard(makePost({ scheduled_at: '2026-09-01T06:00:00.000Z' }))
    expect(dateField().value).toBe('2026-09-01')
    expect(timeField().value).toBe('09:00')
  })

  it('re-seeds every field when the post changes, so no value from the previous post is saved onto the next one', () => {
    const { rerender } = renderCard(makePost())
    expect(dateField().value).toBe('2026-09-01')
    expect(screen.getByDisplayValue('First caption')).toBeInTheDocument()

    rerender(
      <ScheduleCard
        post={makePost({
          id: 'post-2',
          caption: 'Second caption',
          scheduled_at: '2026-09-04T07:30:00.000Z',
        })}
        timeZone={ZONE}
        postIndex={1}
        totalPosts={2}
        isOpen
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSchedule={vi.fn()}
        onUnschedule={vi.fn()}
        onSkip={vi.fn()}
        onDelete={vi.fn()}
        isScheduling={false}
        onImageUpserted={vi.fn()}
        onImageDeleted={vi.fn()}
      />
    )

    expect(dateField().value).toBe('2026-09-04')
    expect(timeField().value).toBe('10:30')
    expect(screen.getByDisplayValue('Second caption')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('First caption')).not.toBeInTheDocument()
  })

  it('falls back to a blank date and 09:00 for an unscheduled post', () => {
    renderCard(makePost({ scheduled_at: null }))
    expect(dateField().value).toBe('')
    expect(timeField().value).toBe('09:00')
  })

  it('renders nothing when closed', () => {
    renderCard(makePost(), { isOpen: false })
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
  })
})
