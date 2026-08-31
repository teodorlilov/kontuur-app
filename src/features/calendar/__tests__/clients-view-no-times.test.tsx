import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClientsView } from '../components/clients-view'
import type { ClientEntry } from '../hooks/use-approval'
import type { BestTimePlatform } from '@/lib/suggested-times/schemas'
import type { CalendarPost } from '@/types/api'

/**
 * Why a client's week has no suggested slots in it.
 *
 * Posting times are measured from Instagram follower-online counts or they do not exist — the
 * writer that invented them for everyone else was deleted. That makes the empty case common and
 * makes explaining it load-bearing: hatched cells simply do not appear, and a blank week reads as
 * "nothing suggested for this client" when it is really "nothing measured yet".
 *
 * The two reasons are not interchangeable. One is a setup step the agency can take right now; the
 * other is a wait. Pinned because a two-branch condition on a boolean is the kind of thing that
 * inverts in a refactor and still renders something plausible.
 */

const WEEK_START = '2026-08-31'

const MEASURED: BestTimePlatform[] = [
  {
    platform: 'Instagram',
    best_days: ['Tuesday'],
    best_time_windows: [{ time: '18:00' }],
    confidence: 'observed',
  },
]

function client(over: Partial<ClientEntry>): ClientEntry {
  return {
    id: 'client-1',
    name: 'Acme Clinic',
    contact_email: null,
    posts_per_week: 3,
    best_times: null,
    instagram_connected: false,
    ...over,
  }
}

function renderWith(entry: ClientEntry) {
  return render(
    <ClientsView
      clients={[entry]}
      laneClients={[]}
      scheduledPosts={[] as CalendarPost[]}
      weekStartISO={WEEK_START}
      timeZone="Europe/Sofia"
    />
  )
}

describe('ClientsView — clients with no measured posting times', () => {
  it('points an unconnected client at the setup step', () => {
    renderWith(client({ instagram_connected: false }))
    expect(screen.getByText(/connect instagram/i)).toBeInTheDocument()
  })

  it('tells a connected client the data is still being collected', () => {
    renderWith(client({ instagram_connected: true }))
    expect(screen.getByText(/collecting follower activity/i)).toBeInTheDocument()
    // Not the setup prompt: their account IS connected, and telling them to connect it is
    // both wrong and the kind of wrong that makes a product feel broken.
    expect(screen.queryByText(/connect instagram/i)).not.toBeInTheDocument()
  })

  it('says nothing at all once times are measured', () => {
    renderWith(client({ instagram_connected: true, best_times: MEASURED }))
    expect(screen.queryByText(/collecting follower activity/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/connect instagram/i)).not.toBeInTheDocument()
  })

  it('treats an empty array as nothing measured, not as measured-and-empty', () => {
    // parseBestTimes returns null for an empty list, but the prop is typed to allow one and a
    // future writer could hand it over. Zero windows produce zero slots either way.
    renderWith(client({ instagram_connected: true, best_times: [] }))
    expect(screen.getByText(/collecting follower activity/i)).toBeInTheDocument()
  })
})
