export type ReviewTab = 'all' | 'priority' | 'health'

export interface ReviewPost {
  id: string
  client_id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: unknown
  validation_json: unknown
  status: string
  priority: boolean
  quality_score_avg: number | null
  was_rewritten: boolean
  rewrite_count: number
  pillar?: string | null
  source_url?: string | null
  source_title?: string | null
  source_type?: string | null
  source_excerpt?: string | null
  created_at: string
  client_name: string
  is_health_niche: boolean
}

export function filterReviewPosts(
  posts: ReviewPost[],
  tab: ReviewTab,
  clientId: string | null
): ReviewPost[] {
  let filtered = posts

  if (clientId) {
    filtered = filtered.filter((p) => p.client_id === clientId)
  }

  if (tab === 'priority') {
    filtered = filtered.filter((p) => p.priority)
  } else if (tab === 'health') {
    filtered = filtered.filter((p) => p.is_health_niche)
  }

  return [...filtered].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
