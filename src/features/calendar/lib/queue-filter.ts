import type { CalendarPost } from '@/types/api'

/**
 * How the backlog is filtered, ordered and gathered.
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

function byNewest(a: CalendarPost, b: CalendarPost): number {
  return b.created_at.localeCompare(a.created_at)
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

/** One labelled run of the list. */
export interface QueueSection {
  key: string
  label: string
  posts: CalendarPost[]
  /** Priority is the only heading that names a flag the posts themselves carry. */
  emphasis?: boolean
}

export interface QueueGroups {
  sections: QueueSection[]
  /** How many survived the filter, for the one honest count in the header. */
  matched: number
}

/**
 * Filter, order and gather the backlog in one pass.
 *
 * **Two of these four options are orderings and two are groupings**, and the control
 * says so in its own words: "Highest score" and "Newest" rank a list, while "By client"
 * and "By pillar" gather one. Treating all four as orderings is what made the sort look
 * broken — the rail rendered the same Priority / Regular headings whatever you picked,
 * and reordering *inside* a pinned Priority group of four is invisible when those four
 * are also the newest and the highest-scoring.
 *
 * So the rankings keep the priority split, because "what should I place next" is what
 * they are for. The groupings drop it: a client's posts appear under that client's name,
 * ordered best-first, and the Priority chip on the row still marks the urgent ones.
 */
export function groupQueue(posts: CalendarPost[], filter: QueueFilter): QueueGroups {
  let result = posts
  if (filter.priorityOnly) result = result.filter((p) => p.priority)
  if (filter.search) result = result.filter((p) => matchesSearch(p, filter.search))
  const matched = result.length

  if (filter.sort === 'client') {
    return { sections: gatherBy(result, (p) => p.client_name, 'Unknown client'), matched }
  }
  if (filter.sort === 'pillar') {
    return { sections: gatherBy(result, (p) => p.pillar ?? '', 'No pillar'), matched }
  }

  const sorted = [...result].sort(filter.sort === 'score' ? byScore : byNewest)
  const sections: QueueSection[] = [
    { key: 'priority', label: 'Priority', emphasis: true, posts: sorted.filter((p) => p.priority) },
  ]

  if (filter.sort === 'newest') {
    // Nothing is lifted out: ranking by age says nothing about whether a post was
    // judged, so pulling the unscored into their own run would answer a question the
    // reader did not ask.
    sections.push({ key: 'regular', label: 'Regular', posts: sorted.filter((p) => !p.priority) })
  } else {
    const scored = sorted.filter((p) => p.quality_score_avg !== null)
    sections[0]!.posts = scored.filter((p) => p.priority)
    sections.push(
      { key: 'regular', label: 'Regular', posts: scored.filter((p) => !p.priority) },
      {
        key: 'unscored',
        label: 'Not scored',
        posts: sorted.filter((p) => p.quality_score_avg === null),
      }
    )
  }

  return { sections: sections.filter((s) => s.posts.length > 0), matched }
}

/**
 * Gather into named runs, best-first inside each.
 *
 * The empty key sorts last under its own name — a post with no pillar belongs at the
 * bottom of the list, not at the top under a blank heading, which is where a plain
 * `localeCompare` on `''` would put it.
 */
function gatherBy(
  posts: CalendarPost[],
  keyOf: (post: CalendarPost) => string,
  emptyLabel: string
): QueueSection[] {
  const byKey = new Map<string, CalendarPost[]>()
  for (const post of posts) {
    const key = keyOf(post)
    const list = byKey.get(key) ?? []
    list.push(post)
    byKey.set(key, list)
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
    .map(([key, group]) => ({
      key: key || '__none',
      label: key || emptyLabel,
      // Best first within a client, because the question is still "which of these next".
      posts: [...group].sort(byScore),
    }))
}
