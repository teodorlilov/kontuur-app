import { describe, expect, it, vi } from 'vitest'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { consolidationWindow, runSyncPhases, type SyncPhase } from '../sync-metrics'

function phase(name: string, run: () => Promise<void>): SyncPhase {
  return { name, run }
}

/** Code 190 classifies as token_invalid; 2 as transient. */
function graphError(code: number, message: string): GraphApiError {
  return new GraphApiError({
    httpStatus: 400,
    code,
    subcode: null,
    type: 'OAuthException',
    message,
    fbtraceId: null,
  })
}

describe('runSyncPhases', () => {
  it('runs every later phase after a narrow failure — the empty-audience bug', async () => {
    const demographics = vi.fn().mockResolvedValue(undefined)
    const failures = await runSyncPhases([
      phase('day totals', () => Promise.resolve()),
      phase('post metrics', () => Promise.reject(new Error('media 9004'))),
      phase('demographics', demographics),
    ])

    // The phase that used to be starved still ran.
    expect(demographics).toHaveBeenCalledTimes(1)
    expect(failures).toEqual(['post metrics: media 9004'])
  })

  it('aborts on account-wide conditions — four more phases cannot fix a dead token', async () => {
    const later = vi.fn().mockResolvedValue(undefined)
    await expect(
      runSyncPhases([
        phase('day totals', () => Promise.reject(graphError(190, 'expired'))),
        phase('demographics', later),
      ])
    ).rejects.toThrow('expired')
    expect(later).not.toHaveBeenCalled()
  })

  it('keeps going through a rate-limited-looking transient, naming each failure', async () => {
    const failures = await runSyncPhases([
      phase('day totals', () => Promise.reject(graphError(2, 'upstream hiccup'))),
      phase('post metrics', () => Promise.reject(new Error('write failed'))),
      phase('demographics', () => Promise.resolve()),
    ])
    expect(failures).toEqual(['day totals: upstream hiccup', 'post metrics: write failed'])
  })

  it('reports nothing when every phase lands', async () => {
    expect(await runSyncPhases([phase('day totals', () => Promise.resolve())])).toEqual([])
  })
})

describe('consolidationWindow', () => {
  it('re-asks days 2..7 back, newest first, and never yesterday', () => {
    // Yesterday belongs to syncAccountDay, which wrote it in full minutes ago;
    // re-asking it here would spend six extra calls to overwrite fresh values.
    const { dayKeys, oldest } = consolidationWindow('2026-08-19')
    expect(dayKeys).toEqual([
      '2026-08-18',
      '2026-08-17',
      '2026-08-16',
      '2026-08-15',
      '2026-08-14',
      '2026-08-13',
    ])
    expect(dayKeys).not.toContain('2026-08-19')
    // The reach series is asked across the same span, so its lower bound has to
    // reach the oldest day the totals pass touched — not one short of it.
    expect(oldest).toBe('2026-08-13')
  })

  it('crosses a month boundary by calendar, not by arithmetic on the day number', () => {
    expect(consolidationWindow('2026-03-02').dayKeys).toEqual([
      '2026-03-01',
      '2026-02-28',
      '2026-02-27',
      '2026-02-26',
      '2026-02-25',
      '2026-02-24',
    ])
  })
})
