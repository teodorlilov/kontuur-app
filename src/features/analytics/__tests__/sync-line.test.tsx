import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncLine } from '../components/sync-line'

const NOW = new Date().toISOString()

describe('SyncLine', () => {
  it('says the run did not finish and names the phases — even when fetched_at looks fresh', () => {
    // The exact shape syncClientMetrics throws. lastSyncAt is current because
    // the on-demand refill stamps fetched_at too: the freshness alone lied.
    render(
      <SyncLine
        lastSyncAt={NOW}
        hasHistory
        hasConnection
        timezone="UTC"
        syncError="partial sync (2 of 5 phases) — demographics: 400 | online hours: timeout"
      />
    )
    expect(screen.getByText(/Last sync did not finish/)).toBeInTheDocument()
    expect(screen.getByText(/demographics and online hours did not update/)).toBeInTheDocument()
    expect(screen.getByText(/retrying tonight at 03:30/)).toBeInTheDocument()
  })

  it('still warns when the failure carries no parsable phase list', () => {
    render(
      <SyncLine
        lastSyncAt={NOW}
        hasHistory
        hasConnection
        timezone="UTC"
        syncError="unknown error"
      />
    )
    expect(screen.getByText(/Last sync did not finish/)).toBeInTheDocument()
  })

  it('reads as healthy after a clean run', () => {
    render(<SyncLine lastSyncAt={NOW} hasHistory hasConnection timezone="UTC" syncError={null} />)
    expect(screen.getByText(/Synced nightly/)).toBeInTheDocument()
  })

  it('lets the disconnected state outrank an incomplete run', () => {
    render(
      <SyncLine
        lastSyncAt={NOW}
        hasHistory
        hasConnection={false}
        timezone="UTC"
        syncError="partial sync (1 of 5 phases) — demographics: 400"
      />
    )
    expect(screen.getByText(/Instagram disconnected/)).toBeInTheDocument()
  })
})
