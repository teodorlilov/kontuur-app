import { describe, expect, it } from 'vitest'
import type { IGInsightEntry } from '../schemas'
import { breakdownMapOf, dailySeriesOf, lifetimeValueOf, totalValueOf } from '../insight-values'

/**
 * The envelope→value contract, pinned to the live probe's recordings
 * (project_meta_probe_results): absence maps to null, never 0 — a stored 0 must
 * mean the API said 0.
 */

describe('totalValueOf', () => {
  it('reads total_value.value, including a genuine 0', () => {
    const data: IGInsightEntry[] = [
      { name: 'views', total_value: { value: 4640 } },
      { name: 'profile_links_taps', total_value: { value: 0 } },
    ]
    expect(totalValueOf(data, 'views')).toBe(4640)
    expect(totalValueOf(data, 'profile_links_taps')).toBe(0)
  })

  it('maps a silent-empty envelope to null, never 0', () => {
    expect(totalValueOf([], 'views')).toBeNull()
  })

  it('maps a breakdown entry with no top-level value to null (follows_and_unfollows shape)', () => {
    const data: IGInsightEntry[] = [
      {
        name: 'follows_and_unfollows',
        total_value: {
          breakdowns: [
            {
              dimension_keys: ['follow_type'],
              results: [{ dimension_values: ['FOLLOWER'], value: 5 }],
            },
          ],
        },
      },
    ]
    expect(totalValueOf(data, 'follows_and_unfollows')).toBeNull()
  })
})

describe('breakdownMapOf', () => {
  it('maps demographics nesting to a plain dimension→value record', () => {
    // The probe's populated shape: single-element dimension_values, plain keys.
    const data: IGInsightEntry[] = [
      {
        name: 'follower_demographics',
        total_value: {
          breakdowns: [
            {
              dimension_keys: ['age'],
              results: [
                { dimension_values: ['25-34'], value: 312 },
                { dimension_values: ['18-24'], value: 190 },
              ],
            },
          ],
        },
      },
    ]
    expect(breakdownMapOf(data, 'follower_demographics')).toEqual({ '25-34': 312, '18-24': 190 })
  })

  it('maps a breakdown whose results key is absent to null (zero-data shape)', () => {
    // profile_links_taps with zero data: value 0, dimension_keys present, NO results.
    const data: IGInsightEntry[] = [
      {
        name: 'profile_links_taps',
        total_value: { value: 0, breakdowns: [{ dimension_keys: ['contact_button_type'] }] },
      },
    ]
    expect(breakdownMapOf(data, 'profile_links_taps')).toBeNull()
  })

  it('maps a silent-empty envelope and an empty results array to null', () => {
    expect(breakdownMapOf([], 'reach')).toBeNull()
    const empty: IGInsightEntry[] = [
      { name: 'reach', total_value: { breakdowns: [{ results: [] }] } },
    ]
    expect(breakdownMapOf(empty, 'reach')).toBeNull()
  })
})

describe('dailySeriesOf', () => {
  it('buckets end_time to YYYY-MM-DD and sorts ascending', () => {
    const data: IGInsightEntry[] = [
      {
        name: 'reach',
        values: [
          { value: 20, end_time: '2026-08-18T07:00:00+0000' },
          { value: 10, end_time: '2026-08-17T07:00:00+0000' },
        ],
      },
    ]
    expect(dailySeriesOf(data, 'reach')).toEqual([
      { date: '2026-08-17', value: 10 },
      { date: '2026-08-18', value: 20 },
    ])
  })

  it('drops non-numeric values (online_followers returns {} on real accounts)', () => {
    const data: IGInsightEntry[] = [
      {
        name: 'online_followers',
        values: [
          { value: {}, end_time: '2026-08-17T07:00:00+0000' },
          { value: 3, end_time: '2026-08-18T07:00:00+0000' },
        ],
      },
    ]
    expect(dailySeriesOf(data, 'online_followers')).toEqual([{ date: '2026-08-18', value: 3 }])
  })

  it('returns an empty series for a silent-empty envelope', () => {
    expect(dailySeriesOf([], 'reach')).toEqual([])
  })
})

describe('lifetimeValueOf', () => {
  it('reads a media insight single value (no end_time on media shapes)', () => {
    const data: IGInsightEntry[] = [{ name: 'saved', values: [{ value: 3 }] }]
    expect(lifetimeValueOf(data, 'saved')).toBe(3)
  })

  it('maps absent metrics and non-numeric values to null', () => {
    expect(lifetimeValueOf([], 'reach')).toBeNull()
    const odd: IGInsightEntry[] = [{ name: 'reach', values: [{ value: {} }] }]
    expect(lifetimeValueOf(odd, 'reach')).toBeNull()
  })
})
