import { describe, it, expect } from 'vitest'
import { filterReviewPosts, type ReviewPost } from '../filter-review-posts'

function makePost(overrides: Partial<ReviewPost> = {}): ReviewPost {
  return {
    id: overrides.id ?? 'post-1',
    client_id: overrides.client_id ?? 'client-1',
    caption: overrides.caption ?? 'Test caption',
    platform: overrides.platform ?? 'instagram',
    post_type: overrides.post_type ?? 'single',
    slides_json: overrides.slides_json ?? null,
    validation_json: overrides.validation_json ?? null,
    status: overrides.status ?? 'pending_review',
    priority: overrides.priority ?? false,
    quality_score_avg: overrides.quality_score_avg ?? 7.5,
    was_rewritten: overrides.was_rewritten ?? false,
    rewrite_count: overrides.rewrite_count ?? 0,
    created_at: overrides.created_at ?? '2026-03-20T10:00:00Z',
    client_name: overrides.client_name ?? 'Test Client',
    is_health_niche: overrides.is_health_niche ?? false,
    images: overrides.images ?? [],
  }
}

const posts: ReviewPost[] = [
  makePost({
    id: 'p1',
    client_id: 'c1',
    priority: true,
    created_at: '2026-03-20T10:00:00Z',
    client_name: 'Alpha',
  }),
  makePost({
    id: 'p2',
    client_id: 'c1',
    priority: false,
    created_at: '2026-03-21T10:00:00Z',
    client_name: 'Alpha',
  }),
  makePost({
    id: 'p3',
    client_id: 'c2',
    priority: false,
    created_at: '2026-03-19T10:00:00Z',
    client_name: 'Beta',
  }),
  makePost({
    id: 'p4',
    client_id: 'c2',
    priority: true,
    created_at: '2026-03-22T10:00:00Z',
    client_name: 'Beta',
  }),
  makePost({
    id: 'p5',
    client_id: 'c1',
    priority: false,
    created_at: '2026-03-18T10:00:00Z',
    client_name: 'Alpha',
  }),
]

describe('filterReviewPosts', () => {
  // Positive tests
  it('returns all posts for "all" tab with no client filter', () => {
    const result = filterReviewPosts(posts, 'all', null)
    expect(result).toHaveLength(5)
  })

  it('returns only priority posts for "priority" tab', () => {
    const result = filterReviewPosts(posts, 'priority', null)
    expect(result).toHaveLength(2)
    expect(result.every((p) => p.priority)).toBe(true)
  })

  it('filters by client_id when provided', () => {
    const result = filterReviewPosts(posts, 'all', 'c1')
    expect(result).toHaveLength(3)
    expect(result.every((p) => p.client_id === 'c1')).toBe(true)
  })

  it('combines priority tab with client filter', () => {
    const result = filterReviewPosts(posts, 'priority', 'c2')
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('p4')
  })

  it('sorts priority posts before non-priority', () => {
    const result = filterReviewPosts(posts, 'all', null)
    const priorityIndices = result
      .map((p, i) => (p.priority ? i : null))
      .filter((i): i is number => i !== null)
    const nonPriorityIndices = result
      .map((p, i) => (!p.priority ? i : null))
      .filter((i): i is number => i !== null)
    const lastPriority = Math.max(...priorityIndices)
    const firstNonPriority = Math.min(...nonPriorityIndices)
    expect(lastPriority).toBeLessThan(firstNonPriority)
  })

  it('sorts by created_at descending within same priority level', () => {
    const result = filterReviewPosts(posts, 'all', null)
    const priorityPosts = result.filter((p) => p.priority)
    expect(priorityPosts[0]?.id).toBe('p4')
    expect(priorityPosts[1]?.id).toBe('p1')
    const nonPriority = result.filter((p) => !p.priority)
    expect(nonPriority[0]?.id).toBe('p2')
    expect(nonPriority[1]?.id).toBe('p3')
    expect(nonPriority[2]?.id).toBe('p5')
  })

  it('returns empty array when no posts match filters', () => {
    const result = filterReviewPosts(posts, 'priority', 'c3')
    expect(result).toEqual([])
  })

  // Negative tests
  it('returns empty array for empty input', () => {
    const result = filterReviewPosts([], 'all', null)
    expect(result).toEqual([])
  })

  it('returns empty array when client_id matches no posts', () => {
    const result = filterReviewPosts(posts, 'all', 'nonexistent')
    expect(result).toEqual([])
  })

  it('returns empty array for priority tab when no priority posts exist', () => {
    const noPriorityPosts = posts.map((p) => ({ ...p, priority: false }))
    const result = filterReviewPosts(noPriorityPosts, 'priority', null)
    expect(result).toEqual([])
  })

  it('null clientId applies no client filter', () => {
    const result = filterReviewPosts(posts, 'all', null)
    expect(result).toHaveLength(posts.length)
  })
})
