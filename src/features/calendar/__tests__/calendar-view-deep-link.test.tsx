import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CalendarView } from '../components/calendar-view'
import { getMondayISO } from '@/utils/date-helpers'
import type { CalendarPost } from '@/types/api'

/**
 * The `?editPost=<id>` deep link, pinned.
 *
 * `calendar-view.tsx:141` carries the second of the three deliberate
 * `react-hooks/set-state-in-effect` suppressions (TECH-DEBT §4.1), and it is the one that
 * genuinely cannot move into render: it consumes a one-shot URL param and then NAVIGATES
 * to clear it, which is a side effect by definition.
 *
 * Two ways it breaks, both quiet. If the `editParamProcessed` ref stops guarding, the
 * effect re-fires on every searchParams identity change and re-opens a card the user just
 * closed. If the `router.replace` goes, the param survives in the URL and the next
 * in-app navigation to /calendar re-opens the same post — a card that will not stay shut.
 *
 * Only the leaves are mocked. `useCalendar` is real, because the post the card receives
 * has to come from the same list the view actually holds.
 */
const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => params,
}))

vi.mock('@/components/layout/shell-context', () => ({
  useShell: () => ({ timezone: 'Europe/Sofia', agencyName: 'Acme', notifications: [] }),
}))

/**
 * Reports the three things the deep link is supposed to set.
 *
 * The `!isOpen || !post` guard is copied from the real component (schedule-card.tsx:225),
 * not invented. A mock that rendered on `isOpen` alone would be MORE permissive than its
 * subject, and the "unknown id" case below would then assert a card that the real card
 * never draws — a test failing against behaviour that is actually correct.
 */
vi.mock('../components/schedule-card', () => ({
  ScheduleCard: ({
    post,
    isOpen,
    editMode,
  }: {
    post: { id: string } | null
    isOpen: boolean
    editMode?: boolean
  }) =>
    !isOpen || !post ? null : (
      <div data-testid="schedule-card" data-post-id={post.id} data-edit-mode={String(!!editMode)} />
    ),
}))

function post(id: string): CalendarPost {
  return {
    id,
    client_id: 'client-1',
    caption: `Caption ${id}`,
    platform: 'Instagram',
    post_type: 'single',
    status: 'scheduled',
    scheduled_at: '2026-09-01T06:00:00.000Z',
    slides_json: null,
    // Only the fields these surfaces read; the cast documents the gap.
  } as CalendarPost
}

const CLIENTS = [{ id: 'client-1', name: 'Acme Clinic', contact_email: 'a@b.test' }]

// The anchor the page would compute for a plain /calendar visit — the current
// week in the mocked shell timezone, so the recenter effect stays quiet.
const ANCHOR = getMondayISO(new Date(), 'Europe/Sofia')

function renderCalendar() {
  return render(
    <CalendarView
      initialPosts={[post('p1'), post('p2')]}
      clients={CLIENTS as never}
      anchorWeekISO={ANCHOR}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  params = new URLSearchParams()
})

describe('CalendarView ?editPost deep link', () => {
  it('opens no card without the param', () => {
    renderCalendar()
    expect(screen.queryByTestId('schedule-card')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('opens the named post in edit mode and clears the param', async () => {
    params = new URLSearchParams('editPost=p2')
    renderCalendar()

    const card = await screen.findByTestId('schedule-card')
    expect(card).toHaveAttribute('data-post-id', 'p2')
    expect(card).toHaveAttribute('data-edit-mode', 'true')
    // Cleared by navigation, not by state: left in the URL, the next in-app arrival at
    // /calendar re-opens the same post and the card cannot be dismissed for good.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/calendar', { scroll: false }))
  })

  it('consumes the param exactly once across re-renders', async () => {
    params = new URLSearchParams('editPost=p1')
    const { rerender } = renderCalendar()
    await screen.findByTestId('schedule-card')
    expect(replace).toHaveBeenCalledTimes(1)

    // A fresh URLSearchParams with the same contents — a new identity, which is what a
    // parent re-render hands the effect. The `editParamProcessed` ref is the only thing
    // stopping this from re-firing.
    params = new URLSearchParams('editPost=p1')
    rerender(
      <CalendarView
        initialPosts={[post('p1'), post('p2')]}
        clients={CLIENTS as never}
        anchorWeekISO={ANCHOR}
      />
    )

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
  })

  it('ignores an id that matches no post', async () => {
    params = new URLSearchParams('editPost=does-not-exist')
    renderCalendar()
    // The param is still consumed — it is one-shot regardless — but no card can open on
    // a post that is not there.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/calendar', { scroll: false }))
    expect(screen.queryByTestId('schedule-card')).not.toBeInTheDocument()
  })
})
