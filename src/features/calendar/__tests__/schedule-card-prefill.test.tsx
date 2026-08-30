import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleCard } from '../components/schedule-card'
import type { CalendarPost } from '@/types/api'

/**
 * The seven-field pre-fill effect, pinned.
 *
 * `schedule-card.tsx:147` carries a block-level `eslint-disable
 * react-hooks/set-state-in-effect` — a deliberate suppression (TECH-DEBT §4.1) on the
 * grounds that seeding seven independent fields from one prop is a genuine effect. The
 * suppression is fine; what it removed was the only automated attention this code had.
 *
 * The failure mode a suppressed initialiser effect has is specific and quiet: it keys on
 * the wrong thing and stops re-seeding, so the form shows the PREVIOUS post's values
 * while the header shows the current one. `feedback-trace-state-loops` names exactly this
 * — key an initialiser on its trigger, not on derived data — and it cost a real bug once.
 *
 * Mocked here: only the leaves that reach the network or the canvas. The effect under
 * test is the component's own.
 */
vi.mock('@/features/assets/hooks/use-canva-status', () => ({
  useCanvaStatus: () => false,
}))
// The real return shape, not an invented one. A mock that drifts from its subject is a
// test that passes against a component nobody ships — this one returned `generating: {}`
// at first and blew up inside `missingImagePositions`, which wants an array.
vi.mock('@/features/assets/hooks/use-generate-visuals', () => ({
  useGenerateVisuals: () => ({
    generatingPositions: [] as number[],
    composingPositions: [] as number[],
    generate: vi.fn(),
    recompose: vi.fn(),
  }),
}))
vi.mock('@/features/assets/components/image-slot', () => ({
  ImageSlot: () => <div data-testid="image-slot" />,
}))
vi.mock('@/features/canvas-editor/components/canvas-editor', () => ({
  CanvasEditor: () => <div data-testid="canvas-editor" />,
}))

const ZONE = 'Europe/Sofia'

function makePost(over: Partial<CalendarPost> = {}): CalendarPost {
  return {
    id: 'post-1',
    client_id: 'client-1',
    caption: 'First caption',
    platform: 'Instagram',
    post_type: 'single',
    status: 'pending',
    scheduled_at: '2026-09-01T06:00:00.000Z',
    slides_json: null,
    // Only the fields this card reads are populated; the cast documents the gap.
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
  it('seeds date and time from the post, in the agency zone', () => {
    // 06:00 UTC is 09:00 in Sofia (UTC+3 in September). Both fields must come from the
    // SAME zone — the documented bug was a UTC date beside a browser-local time, which
    // rewrote the post at the wrong instant on any reopen-and-update.
    renderCard(makePost({ scheduled_at: '2026-09-01T06:00:00.000Z' }))
    expect(dateField().value).toBe('2026-09-01')
    expect(timeField().value).toBe('09:00')
  })

  it('re-seeds every field when the post changes', () => {
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

    // The whole point: no field may still hold post-1's value. A stale caption here is
    // an edit saved onto the wrong post.
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

  it('lets a suggested slot win over what the post already carries', () => {
    // Opened from a gap in the week grid: the slot decides when, not the post's own
    // scheduled_at. Getting this backwards would silently move the post being placed.
    renderCard(makePost({ scheduled_at: '2026-09-01T06:00:00.000Z' }), {
      slotPrefill: { clientId: 'client-1', at: '2026-09-10T14:00:00.000Z' },
    })
    expect(dateField().value).toBe('2026-09-10')
    expect(timeField().value).toBe('17:00')
  })

  it('renders nothing when closed', () => {
    renderCard(makePost(), { isOpen: false })
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
  })
})
