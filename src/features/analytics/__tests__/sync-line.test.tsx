import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncLine } from '../components/document/sync-line'

const NOW = new Date().toISOString()

describe('SyncLine', () => {
  /**
   * The exact string `syncClientMetrics` throws, five phases and all. The stamp is current
   * because `recordSyncHealth` runs on success AND failure, so freshness alone cannot say
   * whether the run finished — only `syncError` can.
   */
  it('says the run did not finish and names the phases — even when the stamp looks fresh', () => {
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

  /**
   * Reachable only because `lastSyncAt` comes from `social_connections.last_sync_at`. Dated from
   * the day rows instead, any on-demand refill would re-stamp it and a cron that had not fired
   * for a week would still read "Synced nightly".
   */
  it('calls a clean-but-old run stale', () => {
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
  it('reads disconnected before first-sync when the network killed a never-synced connection', () => {
    render(
      <SyncLine
        lastSyncAt={null}
        hasHistory={false}
        hasConnection={false}
        timezone="UTC"
        networkLabel="Facebook"
      />
    )
    expect(screen.getByText(/Facebook disconnected — metrics stopped/)).toBeInTheDocument()
    expect(screen.queryByText(/first sync tonight/)).not.toBeInTheDocument()
  })
})
