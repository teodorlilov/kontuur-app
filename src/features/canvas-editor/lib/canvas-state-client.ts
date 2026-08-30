import { safeParseCanvasDoc } from '@/lib/canvas/doc-schema'
import { parseSeedIdentity } from '@/lib/visual/identity-schema'
import type { CanvasDoc } from '@/types/canvas'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'

/**
 * Parse what the canvas route sent, rather than asserting it.
 *
 * Ours is the only route that serves this shape, so it is not a third-party response — but the doc
 * schema is a FORWARD-ONLY door. A doc carrying a role this bundle has never heard of is rejected
 * by design, and a session left on an older bundle by a mid-flight deploy would otherwise cast one
 * straight into `CanvasDoc` and render something that does not exist. Parsing turns that into the
 * "no doc, reseed" outcome every reader here already handles, which is the same answer the server
 * gives for a legacy row.
 */
function parseDoc(value: unknown): CanvasDoc | null {
  if (value === null || value === undefined) return null
  const parsed = safeParseCanvasDoc(value)
  return parsed.success ? parsed.doc : null
}

/**
 * The seed identity, or null when the body carries nothing usable — callers treat that as a miss.
 *
 * Through `seedIdentitySchema`, NOT the stored-blob schema. This used to rebuild `{ palette, style }`
 * out of `safeParseVisualIdentity`, which validates `brand_visual_identity.identity` — a shape that
 * has no client name in it and never will. So when the seed identity grew one, this function
 * silently dropped it and the `quote` lockup lost its byline on every persisted post.
 */
const parseIdentity = parseSeedIdentity

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
  const body: unknown = await res.json().catch(() => ({}))
  const fields = body as { docs?: unknown; identity?: unknown; error?: unknown }
  const identity = parseIdentity(fields.identity)
  if (!res.ok || !identity) {
    throw new Error(typeof fields.error === 'string' ? fields.error : 'Failed to load the canvas')
  }
  // A row this bundle cannot parse drops out of the list rather than failing the open — the slide
  // reseeds, exactly as it does for one that never had a doc.
  const rows = Array.isArray(fields.docs) ? fields.docs : []
  const docs = rows.flatMap((row): PositionedDoc[] => {
    const entry = row as { position?: unknown; doc?: unknown }
    const doc = parseDoc(entry.doc)
    return typeof entry.position === 'number' && doc ? [{ position: entry.position, doc }] : []
  })
  return { docs, identity }
}
