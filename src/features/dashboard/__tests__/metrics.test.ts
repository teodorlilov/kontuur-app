import { describe, expect, it } from 'vitest'
import { countFilledPerDay, countWeek, describeWeek } from '../lib/metrics'
import { emptyWeek, type WeekDay } from '@/lib/queries/week-coverage'

function week(states: Array<WeekDay['state']>): WeekDay[] {
  return states.map((state, index) => ({
    state,
    postId: state === 'open' ? null : `p${index}`,
    at: state === 'open' ? null : `2026-09-0${index + 7}T09:00:00Z`,
    count: state === 'open' ? 0 : 1,
  }))
}

const MIXED = week(['published', 'scheduled', 'open', 'published', 'open', 'open', 'open'])

describe('countFilledPerDay', () => {
  it('sums filled days across clients, Monday first', () => {
    const counts = countFilledPerDay({
      a: MIXED,
      b: week(['scheduled', 'open', 'open', 'open', 'open', 'open', 'open']),
    })
    expect(counts).toEqual([2, 1, 0, 1, 0, 0, 0])
  })

  it('is seven zeros for no clients', () => {
    expect(countFilledPerDay({})).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('countWeek', () => {
  it('splits a week into its three states', () => {
    expect(countWeek(MIXED)).toEqual({ published: 2, scheduled: 1, open: 4 })
  })

  it('reads an empty week as seven open days', () => {
    expect(countWeek(emptyWeek())).toEqual({ published: 0, scheduled: 0, open: 7 })
  })
})

describe('describeWeek', () => {
  it('states the same counts in words', () => {
    expect(describeWeek(MIXED)).toBe('2 published, 1 scheduled, 4 open')
  })
})
