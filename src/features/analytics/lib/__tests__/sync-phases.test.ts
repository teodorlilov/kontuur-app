import { describe, expect, it, vi } from 'vitest'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { runSyncPhases, type SyncPhase } from '../sync-metrics'

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
