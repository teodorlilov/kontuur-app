import { describe, expect, it } from 'vitest'
import { isClaimLive } from '../scheduler'
import type { Publication } from '../publication-store'

/**
 * The predicate that stops publish-now double-posting.
 *
 * The fresh-claim CAS compares against the state its caller just read, so it admits a claim
 * that already exists — the guard against feeding it a live row lives in the route, on this
 * function. Nothing else in `npm run check` can see that race: it only shows up when a person
 * presses Publish now while the cron (or a second tab) is inside the multi-second window
 * between claiming and persisting a reference, which is exactly when Instagram would receive
 * two containers and make both live.
 *
 * The thresholds mirror the cron's SQL arms in the same file: a claim holding a reference is
 * live for the 90s resume grace; one without is live for the 30-minute stale-claim window.
 */

const NOW = new Date('2026-09-06T12:00:00.000Z')

function claimedAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

function publication(over: Partial<Publication>): Publication {
  return {
    id: 'pub-1',
    post_id: 'post-1',
    platform: 'instagram',
    account_id: 'acct-1',
    status: 'publishing',
    external_post_id: null,
    publish_ref: null,
    published_at: null,
    publish_error: null,
    publish_attempts: 1,
    publish_claimed_at: null,
    ...over,
  }
}

describe('isClaimLive', () => {
  it('protects a fresh claim still uploading, before any reference exists', () => {
    // The cron claimed 10s ago and is mid-upload: publish_ref is not persisted yet. This is
    // the window the double-post lived in — a second run reading this row must not act on it.
    expect(isClaimLive(publication({ publish_claimed_at: claimedAgo(10_000) }), NOW)).toBe(true)
  })

  it('releases an unreferenced claim only once its run is provably dead', () => {
    // A run lives at most 300s; 30 minutes without a reference means it died before Meta
    // accepted anything, so a retry cannot duplicate.
    expect(isClaimLive(publication({ publish_claimed_at: claimedAgo(31 * 60 * 1000) }), NOW)).toBe(
      false
    )
  })

  it('releases a referenced claim after the resume grace, because resuming is duplicate-safe', () => {
    const withRef = { publish_ref: 'creation-9' }
    expect(
      isClaimLive(publication({ ...withRef, publish_claimed_at: claimedAgo(30_000) }), NOW)
    ).toBe(true)
    expect(
      isClaimLive(publication({ ...withRef, publish_claimed_at: claimedAgo(2 * 60 * 1000) }), NOW)
    ).toBe(false)
  })

  it('never blocks a row that is not mid-publish', () => {
    // 'scheduled' and 'failed' rows are publish-now's normal input, whatever their stamps say.
    expect(
      isClaimLive(publication({ status: 'scheduled', publish_claimed_at: claimedAgo(1_000) }), NOW)
    ).toBe(false)
    expect(
      isClaimLive(publication({ status: 'failed', publish_claimed_at: claimedAgo(1_000) }), NOW)
    ).toBe(false)
    // A 'publishing' row with no claim stamp is a 20260838 backfill artifact, not a live run.
    expect(isClaimLive(publication({ publish_claimed_at: null }), NOW)).toBe(false)
  })
})
