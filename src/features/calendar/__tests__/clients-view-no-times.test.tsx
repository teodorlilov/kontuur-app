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
    best_time_updated_at: null,
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
    expect(screen.getByText(/best time ready after 14 days/i)).toBeInTheDocument()
    // Not the setup prompt: their account IS connected, and telling them to connect it is
    // both wrong and the kind of wrong that makes a product feel broken.
    expect(screen.queryByText(/connect instagram/i)).not.toBeInTheDocument()
  })

  it('says nothing at all once times are measured', () => {
    renderWith(client({ instagram_connected: true, best_times: MEASURED }))
    expect(screen.queryByText(/best time ready after 14 days/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/connect instagram/i)).not.toBeInTheDocument()
  })

  it('treats an empty array as nothing measured, not as measured-and-empty', () => {
    // parseBestTimes returns null for an empty list, but the prop is typed to allow one and a
    // future writer could hand it over. Zero windows produce zero slots either way.
    renderWith(client({ instagram_connected: true, best_times: [] }))
    expect(screen.getByText(/best time ready after 14 days/i)).toBeInTheDocument()
  })
})

/**
 * How old the measurement is.
 *
 * `best_time_json` has no expiry. A client whose Instagram sync broke in June keeps showing June's
 * hours, and their suggested slots look exactly as current as a client synced last night — the
 * staleness is invisible precisely where someone would act on it. The date is the only thing that
 * separates the two, which is why the column stopped being write-only.
 */
describe('ClientsView — how old the measurement is', () => {
  it('dates the measurement when times exist', () => {
    renderWith(
      client({
        instagram_connected: true,
        best_times: MEASURED,
        best_time_updated_at: '2026-08-14T02:10:00.000Z',
      })
    )
    expect(screen.getByText(/last updated 14 aug 2026/i)).toBeInTheDocument()
  })

  it('says nothing about a date when there are no times to date', () => {
    // A stamp without times would describe a measurement that produced nothing.
    renderWith(client({ instagram_connected: true, best_time_updated_at: '2026-08-14T02:10:00Z' }))
    expect(screen.queryByText(/last updated/i)).not.toBeInTheDocument()
    expect(screen.getByText(/best time ready after 14 days/i)).toBeInTheDocument()
  })

  it('omits the line rather than inventing one when the stamp is missing', () => {
    // Rows written before the column was populated: times, no date. Better silent than "Invalid Date".
    renderWith(client({ instagram_connected: true, best_times: MEASURED }))
    expect(screen.queryByText(/last updated/i)).not.toBeInTheDocument()
  })
})
