import type { PostImage } from '@/types/api'

/** A client sign-off request attached to a queue post (post_approval_tokens). */
export interface QueueApproval {
  status: 'pending' | 'approved' | 'changes_requested'
  expiresAt: string
}

/** One pending_review post as the queue page loads it — the shell's data contract. */
export interface QueuePost {
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
  pillar: string | null
  source_url: string | null
  source_title: string | null
  source_type: string | null
  source_excerpt: string | null
  scheduled_at: string | null
  created_at: string
  client_name: string
  is_health_niche: boolean
  images: PostImage[]
  approval: QueueApproval | null
}
