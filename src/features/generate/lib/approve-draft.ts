import { draftColumns } from '@/lib/generation/draft-columns'
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
        ...draftColumns(post),
        // The reviewer's edits win over what was generated.
        ...(caption !== undefined ? { caption } : {}),
        ...(slidesJson !== undefined ? { slides_json: slidesJson } : {}),
        status: scheduledAt ? 'scheduled' : 'approved',
        scheduled_at: scheduledAt ?? null,
        priority: post.priority,
        was_rewritten: post.was_rewritten,
        rewrite_count: post.rewrite_count,
        ...(images.length > 0 ? { images } : {}),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
