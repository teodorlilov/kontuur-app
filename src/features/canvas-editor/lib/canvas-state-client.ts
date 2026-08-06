import type { CanvasDoc } from '@/types/canvas'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'

export interface CanvasState {
  /** False when the request itself failed; `error` then carries the reason. */
  ok: boolean
  doc: CanvasDoc | null
  identity: SeedIdentity | null
  error?: string
}

/**
 * Read one post position's stored canvas doc and the brand identity to seed from.
 *
 * Callers disagree on what a miss means — the editor throws so the user sees it,
 * auto-compose returns null so a background pass skips the slide — so this reports
 * the outcome rather than deciding it.
 */
export async function fetchCanvasState(postId: string, position: number): Promise<CanvasState> {
  const res = await fetch(`/api/posts/${postId}/canvas?position=${position}`)
  const body = (await res.json().catch(() => ({}))) as {
    doc?: CanvasDoc | null
    identity?: SeedIdentity
    error?: string
  }
  return {
    ok: res.ok,
    doc: body.doc ?? null,
    identity: body.identity ?? null,
    error: body.error,
  }
}
