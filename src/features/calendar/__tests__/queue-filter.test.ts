import { describe, expect, it } from 'vitest'
import { groupQueue } from '../lib/queue-filter'
import type { CalendarPost } from '@/types/api'

function post(over: Partial<CalendarPost>): CalendarPost {
  return {
    id: 'x',
    client_name: 'Acme',
    caption: null,
    topic_summary: null,
    pillar: null,
    priority: false,
    quality_score_avg: 8,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as CalendarPost
}

describe('groupQueue', () => {
  it('sorts unscored last, never as zero', () => {
    // The decision this guards: a post nobody judged has not earned last place, so
    // treating null as 0 would rank it below a measured failure.
    const posts = [
      post({ id: 'unscored', quality_score_avg: null }),
      post({ id: 'weak', quality_score_avg: 2 }),
      post({ id: 'strong', quality_score_avg: 9 }),
    ]
    const groups = groupQueue(posts, { search: '', priorityOnly: false, sort: 'score' })
    expect(groups.regular.map((p) => p.id)).toEqual(['strong', 'weak'])
    // ...and lifted out entirely, so an absence never reads as a rank.
    expect(groups.unscored.map((p) => p.id)).toEqual(['unscored'])
  })

  it('keeps unscored posts inline when not sorting by score', () => {
    const posts = [post({ id: 'a', quality_score_avg: null })]
    const groups = groupQueue(posts, { search: '', priorityOnly: false, sort: 'newest' })
    expect(groups.unscored).toEqual([])
    expect(groups.regular.map((p) => p.id)).toEqual(['a'])
  })

  it('splits priority out of the ranked set', () => {
    const posts = [post({ id: 'p', priority: true }), post({ id: 'r' })]
    const groups = groupQueue(posts, { search: '', priorityOnly: false, sort: 'score' })
    expect(groups.priority.map((p) => p.id)).toEqual(['p'])
    expect(groups.regular.map((p) => p.id)).toEqual(['r'])
  })

  it('searches topic, caption, client and pillar', () => {
    const posts = [
      post({ id: 'byTopic', topic_summary: 'Sourdough starter' }),
      post({ id: 'byCaption', caption: 'about bread' }),
      post({ id: 'byClient', client_name: 'Nord Bakery' }),
      post({ id: 'byPillar', pillar: 'Baking' }),
      post({ id: 'miss', topic_summary: 'Something else' }),
    ]
    const ids = (q: string) => {
      const g = groupQueue(posts, { search: q, priorityOnly: false, sort: 'newest' })
      return [...g.priority, ...g.regular, ...g.unscored].map((p) => p.id)
    }
    expect(ids('sourdough')).toEqual(['byTopic'])
    expect(ids('bread')).toEqual(['byCaption'])
    expect(ids('nord')).toEqual(['byClient'])
    expect(ids('baking')).toEqual(['byPillar'])
  })

  it('reports how many survived the filter, for the one honest count', () => {
    const posts = [post({ id: 'a', priority: true }), post({ id: 'b' })]
    expect(groupQueue(posts, { search: '', priorityOnly: true, sort: 'score' }).matched).toBe(1)
    expect(groupQueue(posts, { search: '', priorityOnly: false, sort: 'score' }).matched).toBe(2)
  })

  it('does not mutate the array it is given', () => {
    const posts = [post({ id: 'b', quality_score_avg: 2 }), post({ id: 'a', quality_score_avg: 9 })]
    const order = posts.map((p) => p.id)
    groupQueue(posts, { search: '', priorityOnly: false, sort: 'score' })
    expect(posts.map((p) => p.id)).toEqual(order)
  })
})
