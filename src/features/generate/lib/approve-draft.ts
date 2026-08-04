import type { PostData } from '@/types/post'

export interface DraftImagePayload {
  position: number
  publicUrl: string
  storagePath: string
}

interface ApproveDraftInput {
  post: PostData
  /** Edited caption/slides override the streamed values; omitted = as generated. */
  caption?: string | null
  slidesJson?: unknown
  /** ISO timestamp schedules the post; null/undefined approves unscheduled. */
  scheduledAt?: string | null
  images: DraftImagePayload[]
}

/**
 * The one approve call for a wizard draft: POST /api/posts with the full draft
 * payload. `status` derives from `scheduledAt` — the server stores it verbatim
 * and the calendar reads it. Every approve path (single, approve-all) goes
 * through here so the body cannot drift between them.
 */
export async function approveDraft({
  post,
  caption,
  slidesJson,
  scheduledAt,
  images,
}: ApproveDraftInput): Promise<boolean> {
  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: post.client_id,
        caption: caption !== undefined ? caption : post.caption,
        platform: post.platform,
        post_type: post.post_type,
        slides_json: slidesJson !== undefined ? slidesJson : post.slides_json,
        validation_json: post.validation_json,
        status: scheduledAt ? 'scheduled' : 'approved',
        scheduled_at: scheduledAt ?? null,
        priority: post.priority,
        quality_score_avg: post.quality_score_avg,
        topic_summary: post.topic_summary,
        was_rewritten: post.was_rewritten,
        rewrite_count: post.rewrite_count,
        source_url: post.source_url ?? null,
        source_title: post.source_title ?? null,
        source_type: post.source_type ?? null,
        source_excerpt: post.source_excerpt ?? null,
        client_source_id: post.client_source_id ?? null,
        pillar: post.pillar ?? null,
        ...(images.length > 0 ? { images } : {}),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
