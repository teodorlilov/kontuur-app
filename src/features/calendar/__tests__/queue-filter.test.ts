import { describe, expect, it } from 'vitest'
import { groupQueue, type QueueFilter, type QueueGroups } from '../lib/queue-filter'
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

function group(posts: CalendarPost[], filter: Partial<QueueFilter> = {}): QueueGroups {
  return groupQueue(posts, { search: '', priorityOnly: false, sort: 'score', ...filter })
}

/** The section labels, in the order the rail renders them. */
function labels(groups: QueueGroups): string[] {
  return groups.sections.map((s) => s.label)
}

/** Post ids in one named section. */
function ids(groups: QueueGroups, label: string): string[] {
  return (groups.sections.find((s) => s.label === label)?.posts ?? []).map((p) => p.id)
}

/** Post ids across every section, in render order. */
function flat(groups: QueueGroups): string[] {
  return groups.sections.flatMap((s) => s.posts.map((p) => p.id))
}

describe('groupQueue', () => {
  describe('ranking by score', () => {
    it('sorts unscored last, never as zero', () => {
      // The decision this guards: a post nobody judged has not earned last place, so
      // treating null as 0 would rank it below a measured failure.
      const groups = group([
        post({ id: 'unscored', quality_score_avg: null }),
        post({ id: 'weak', quality_score_avg: 2 }),
        post({ id: 'strong', quality_score_avg: 9 }),
      ])
      expect(ids(groups, 'Regular')).toEqual(['strong', 'weak'])
      // ...and lifted out entirely, so an absence never reads as a rank.
      expect(ids(groups, 'Not scored')).toEqual(['unscored'])
    })

    it('splits priority out of the ranked set', () => {
      const groups = group([post({ id: 'p', priority: true }), post({ id: 'r' })])
      expect(ids(groups, 'Priority')).toEqual(['p'])
      expect(ids(groups, 'Regular')).toEqual(['r'])
    })

    it('sorts inside each section, not just across the whole list', () => {
      const groups = group([
        post({ id: 'p-weak', priority: true, quality_score_avg: 3 }),
        post({ id: 'r-weak', quality_score_avg: 2 }),
        post({ id: 'p-strong', priority: true, quality_score_avg: 9 }),
        post({ id: 'r-strong', quality_score_avg: 8 }),
      ])
      expect(ids(groups, 'Priority')).toEqual(['p-strong', 'p-weak'])
      expect(ids(groups, 'Regular')).toEqual(['r-strong', 'r-weak'])
    })
  })

  describe('ranking by newest', () => {
    it('puts the most recent first', () => {
      const groups = group(
        [
          post({ id: 'old', created_at: '2026-08-01T00:00:00.000Z' }),
          post({ id: 'new', created_at: '2026-08-09T00:00:00.000Z' }),
          post({ id: 'mid', created_at: '2026-08-05T00:00:00.000Z' }),
        ],
        { sort: 'newest' }
      )
      expect(ids(groups, 'Regular')).toEqual(['new', 'mid', 'old'])
    })

    it('keeps unscored posts inline', () => {
      // Ranking by age says nothing about whether a post was judged, so lifting the
      // unscored out would answer a question the reader did not ask.
      const groups = group([post({ id: 'a', quality_score_avg: null })], { sort: 'newest' })
      expect(labels(groups)).toEqual(['Regular'])
      expect(ids(groups, 'Regular')).toEqual(['a'])
    })
  })

  /**
   * The half that was silently missing. "By client" and "By pillar" are grouping words,
   * and the rail rendered Priority / Regular whatever was chosen — so picking them
   * reordered posts *inside* a pinned Priority group of four and looked like nothing at
   * all had happened.
   */
  describe('gathering by client', () => {
    it('makes a section per client, alphabetically', () => {
      const groups = group(
        [
          post({ id: 'v', client_name: 'Verdant' }),
          post({ id: 'h', client_name: 'Hälsa' }),
          post({ id: 'n', client_name: 'Nord' }),
        ],
        { sort: 'client' }
      )
      expect(labels(groups)).toEqual(['Hälsa', 'Nord', 'Verdant'])
    })

    it('gathers a client’s posts together, best first', () => {
      const groups = group(
        [
          post({ id: 'h-weak', client_name: 'Hälsa', quality_score_avg: 3 }),
          post({ id: 'n-any', client_name: 'Nord' }),
          post({ id: 'h-strong', client_name: 'Hälsa', quality_score_avg: 9 }),
        ],
        { sort: 'client' }
      )
      expect(ids(groups, 'Hälsa')).toEqual(['h-strong', 'h-weak'])
    })

    it('stops pinning priority to the top', () => {
      // The whole point: gathering by client means a client's posts are together, not
      // scattered between a Priority run and a Regular one.
      const groups = group(
        [
          post({ id: 'nord-urgent', client_name: 'Nord', priority: true }),
          post({ id: 'halsa', client_name: 'Hälsa' }),
        ],
        { sort: 'client' }
      )
      expect(labels(groups)).toEqual(['Hälsa', 'Nord'])
      expect(flat(groups)).toEqual(['halsa', 'nord-urgent'])
    })
  })

  describe('gathering by pillar', () => {
    it('makes a section per pillar, with the unset ones last under their own name', () => {
      // `''` sorts first under a blank heading with a plain localeCompare — a post with
      // no pillar belongs at the bottom, named.
      const groups = group(
        [
          post({ id: 'story', pillar: 'Story' }),
          post({ id: 'none', pillar: null }),
          post({ id: 'craft', pillar: 'Craft' }),
        ],
        { sort: 'pillar' }
      )
      expect(labels(groups)).toEqual(['Craft', 'Story', 'No pillar'])
      expect(ids(groups, 'No pillar')).toEqual(['none'])
    })
  })

  it('changing the sort changes the answer', () => {
    // The claim the control makes, asserted across all four options.
    const posts = [
      post({ id: 'newest-weak', client_name: 'Zed', created_at: '2026-08-09T00:00:00.000Z', quality_score_avg: 4 }),
      post({ id: 'oldest-strong', client_name: 'Acme', created_at: '2026-08-01T00:00:00.000Z', quality_score_avg: 9 }),
    ]
    expect(flat(group(posts, { sort: 'newest' }))).toEqual(['newest-weak', 'oldest-strong'])
    expect(flat(group(posts, { sort: 'score' }))).toEqual(['oldest-strong', 'newest-weak'])
    expect(labels(group(posts, { sort: 'client' }))).toEqual(['Acme', 'Zed'])
    expect(labels(group(posts, { sort: 'pillar' }))).toEqual(['No pillar'])
  })

  it('drops sections that nothing filled', () => {
    // Three fixed headings meant an empty "Not scored" rule sat under every list.
    const groups = group([post({ id: 'a' })])
    expect(labels(groups)).toEqual(['Regular'])
  })

  it('searches topic, caption, client and pillar', () => {
    const posts = [
      post({ id: 'byTopic', topic_summary: 'Sourdough starter' }),
      post({ id: 'byCaption', caption: 'about bread' }),
      post({ id: 'byClient', client_name: 'Nord Bakery' }),
      post({ id: 'byPillar', pillar: 'Baking' }),
      post({ id: 'miss', topic_summary: 'Something else' }),
    ]
    const found = (q: string) => flat(group(posts, { search: q, sort: 'newest' }))
    expect(found('sourdough')).toEqual(['byTopic'])
    expect(found('bread')).toEqual(['byCaption'])
    expect(found('nord')).toEqual(['byClient'])
    expect(found('baking')).toEqual(['byPillar'])
  })

  it('reports how many survived the filter, for the one honest count', () => {
    const posts = [post({ id: 'a', priority: true }), post({ id: 'b' })]
    expect(group(posts, { priorityOnly: true }).matched).toBe(1)
    expect(group(posts).matched).toBe(2)
  })

  it('does not mutate the array it is given', () => {
    const posts = [post({ id: 'b', quality_score_avg: 2 }), post({ id: 'a', quality_score_avg: 9 })]
    const order = posts.map((p) => p.id)
    group(posts)
    expect(posts.map((p) => p.id)).toEqual(order)
  })
})
