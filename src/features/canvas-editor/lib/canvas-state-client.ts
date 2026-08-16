import type { CanvasDoc } from '@/types/canvas'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'

interface CanvasState {
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

/** One stored doc, by the slide it belongs to. Slides without a doc are simply absent. */
interface PositionedDoc {
  position: number
  doc: CanvasDoc
}

/**
 * Every stored doc for a post, plus the identity to seed the slides that have none.
 *
 * The editor's own load: it can move between all of a post's slides, so it asks for all of them at
 * once. A miss throws rather than returning a flag — unlike the per-position read, this one has no
 * caller that can carry on without it.
 */
export async function fetchCanvasDocs(
  postId: string
): Promise<{ docs: PositionedDoc[]; identity: SeedIdentity }> {
  const res = await fetch(`/api/posts/${postId}/canvas`)
  const body = (await res.json().catch(() => ({}))) as {
    docs?: PositionedDoc[]
    identity?: SeedIdentity
    error?: string
  }
  if (!res.ok || !body.identity) throw new Error(body.error ?? 'Failed to load the canvas')
  return { docs: body.docs ?? [], identity: body.identity }
}
