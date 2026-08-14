import type { CalendarPost } from '@/types/api'

/**
 * How the backlog is filtered and ordered.
 *
 * Extracted from the panel so it can be tested at all: the suite runs
 * `environment: 'node'`, so logic left inside a component is covered by nothing — and
 * the null-last rule below is a deliberate decision that had no test.
 */

export type QueueSort = 'score' | 'client' | 'newest' | 'pillar'

export interface QueueFilter {
  search: string
  priorityOnly: boolean
  sort: QueueSort
}

/**
 * Unscored posts sort **last**, never as zeros.
 *
 * A post nobody judged has not earned last place — treating `null` as 0 would rank an
 * unmeasured post below a measured failure. They are then lifted out into their own
 * labelled group, so an absence never reads as a rank.
 */
function byScore(a: CalendarPost, b: CalendarPost): number {
  if (a.quality_score_avg === null && b.quality_score_avg === null) return 0
  if (a.quality_score_avg === null) return 1
  if (b.quality_score_avg === null) return -1
  return b.quality_score_avg - a.quality_score_avg
}

const COMPARATORS: Record<QueueSort, (a: CalendarPost, b: CalendarPost) => number> = {
  score: byScore,
  client: (a, b) => a.client_name.localeCompare(b.client_name),
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  pillar: (a, b) => (a.pillar ?? '').localeCompare(b.pillar ?? ''),
}

function matchesSearch(post: CalendarPost, query: string): boolean {
  const q = query.toLowerCase()
  return (
    post.client_name.toLowerCase().includes(q) ||
    (post.topic_summary ?? '').toLowerCase().includes(q) ||
    (post.caption ?? '').toLowerCase().includes(q) ||
    (post.pillar ?? '').toLowerCase().includes(q)
  )
}

export interface QueueGroups {
  priority: CalendarPost[]
  regular: CalendarPost[]
  /** Only populated when sorting by score — otherwise these sit in `regular`. */
  unscored: CalendarPost[]
  /** How many survived the filter, for the one honest count in the header. */
  matched: number
}

/** Filter, sort and group the backlog in one pass. */
export function groupQueue(posts: CalendarPost[], filter: QueueFilter): QueueGroups {
  let result = posts
  if (filter.priorityOnly) result = result.filter((p) => p.priority)
  if (filter.search) result = result.filter((p) => matchesSearch(p, filter.search))

  const sorted = [...result].sort(COMPARATORS[filter.sort])
  const matched = sorted.length

  if (filter.sort !== 'score') {
    return {
      priority: sorted.filter((p) => p.priority),
      regular: sorted.filter((p) => !p.priority),
      unscored: [],
      matched,
    }
  }

  const scored = sorted.filter((p) => p.quality_score_avg !== null)
  return {
    priority: scored.filter((p) => p.priority),
    regular: scored.filter((p) => !p.priority),
    unscored: sorted.filter((p) => p.quality_score_avg === null),
    matched,
  }
}
