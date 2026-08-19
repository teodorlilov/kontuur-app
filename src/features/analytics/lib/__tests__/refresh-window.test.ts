import { describe, expect, it } from 'vitest'
import { selectRefillDays } from '../refresh-window'
import type { AnalyticsPeriod } from '../period'

/** A 4-day period (Aug 15–18) against the 4 days before it (Aug 11–14). */
const PERIOD: AnalyticsPeriod = {
  preset: 'custom',
  start: '2026-08-15',
  end: '2026-08-18',
  prevStart: '2026-08-11',
  prevEnd: '2026-08-14',
  days: 4,
}

const ASKED = '2026-08-19T03:30:00Z'

describe('selectRefillDays', () => {
  it('targets never-asked days across BOTH windows, newest first', () => {
    const targets = selectRefillDays(
      [
        // Asked (nightly sync) — inside the consolidation tail, so re-asked.
        { metric_date: '2026-08-18', totals_synced_at: ASKED },
        // Asked, outside the tail — never re-spent on, even if Meta had nothing.
        { metric_date: '2026-08-13', totals_synced_at: ASKED },
        // Backfill row: present but totals never asked — refillable.
        { metric_date: '2026-08-16', totals_synced_at: null },
      ],
      PERIOD,
      '2026-08-19'
    )
    expect(targets).toEqual([
      '2026-08-18', // tail re-ask (within 3 days of today)
      '2026-08-17',
      '2026-08-16',
      '2026-08-15',
      '2026-08-14',
      '2026-08-12',
      '2026-08-11',
    ])
    expect(targets).not.toContain('2026-08-13')
  })

  it('never targets today or later — the day is still accruing', () => {
    const targets = selectRefillDays([], PERIOD, '2026-08-17')
    expect(targets[0]).toBe('2026-08-16')
    expect(targets).not.toContain('2026-08-17')
    expect(targets).not.toContain('2026-08-18')
  })

  it('honors the call-budget cap, spending it on the newest days', () => {
    const targets = selectRefillDays([], PERIOD, '2026-08-19', 3)
    expect(targets).toEqual(['2026-08-18', '2026-08-17', '2026-08-16'])
  })
})
