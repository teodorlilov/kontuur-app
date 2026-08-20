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

  it('calls a clean-but-old run stale', () => {
    // Reachable only now that the page feeds social_connections.last_sync_at.
    // While this read max(fetched_at), any on-demand refill re-stamped it and
    // a cron that had not fired for a week still reported "Synced nightly".
    const threeNightsAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    render(
      <SyncLine
        lastSyncAt={threeNightsAgo}
        hasHistory
        hasConnection
        timezone="UTC"
        syncError={null}
      />
    )
    expect(screen.getByText(/more than two nights ago/)).toBeInTheDocument()
    expect(screen.queryByText(/Synced nightly/)).not.toBeInTheDocument()
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
