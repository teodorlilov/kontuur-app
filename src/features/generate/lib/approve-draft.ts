import { draftColumns } from '@/lib/generation/draft-columns'
import type { PostData } from '@/types/post'

interface DraftImagePayload {
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
 * The outcome of an approve.
 *
 * `warnings` is the route's partial-success channel: the post committed, but a side-write
 * that hangs off it (visuals, canvas docs) did not. It used to be logged server-side only,
 * so the user was told "approved" and found the images missing days later in the calendar.
 */
export interface ApproveDraftResult {
  /** The SAVED row's id, or null when nothing was approved. */
  postId: string | null
  warnings: string[]
}

/**
 * The one approve call for a wizard draft: POST /api/posts with the full draft
 * payload. `status` derives from `scheduledAt` — the server stores it verbatim
 * and the calendar reads it. Every approve path (single, approve-all) goes
 * through here so the body cannot drift between them.
 *
 * The draft's own id never reaches the database — the insert generates a fresh one — so
 * anything that references the post afterwards (the idea link) must use the returned
 * `postId`; using the draft id is a foreign-key violation.
 */
export async function approveDraft({
  post,
  caption,
  slidesJson,
  scheduledAt,
  images,
}: ApproveDraftInput): Promise<ApproveDraftResult> {
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
    if (!res.ok) return { postId: null, warnings: [] }
    const data = (await res.json()) as { post?: { id?: string }; warnings?: string[] }
    return { postId: data.post?.id ?? null, warnings: data.warnings ?? [] }
  } catch {
    return { postId: null, warnings: [] }
  }
}
