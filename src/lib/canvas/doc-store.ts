import 'server-only'

import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CanvasDoc } from '@/types/canvas'
import type { Json } from '@/types/database'

type Admin = ReturnType<typeof createAdminSupabaseClient>

/**
 * The only writer of `post_canvas_docs`. Both call sites used to carry their own
 * `as unknown as Json` cast, which is the kind of thing that quietly stops matching the column.
 *
 * A CanvasDoc is a plain JSON object tree, but the generated `Json` type is a recursive union that
 * a structural interface never satisfies — the same reason `visual/queries.ts` keeps an `asJson`.
 * Funnelling both writes through here means one cast, in one place, with one reason.
 */
function docAsJson(doc: CanvasDoc): Json {
  return doc as unknown as Json
}

/** Save the doc for one slide position, replacing whatever was there. */
export async function upsertCanvasDoc(
  admin: Admin,
  row: { postId: string; position: number; doc: CanvasDoc }
): Promise<{ error: string | null }> {
  const { error } = await admin.from('post_canvas_docs').upsert(
    {
      post_id: row.postId,
      position: row.position,
      doc: docAsJson(row.doc),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'post_id,position' }
  )
  return { error: error?.message ?? null }
}

/** Attach several positions' docs to a post at once (wizard draft → post). */
export async function insertCanvasDocs(
  admin: Admin,
  rows: Array<{ postId: string; position: number; doc: CanvasDoc }>
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null }
  const { error } = await admin.from('post_canvas_docs').insert(
    rows.map((row) => ({
      post_id: row.postId,
      position: row.position,
      doc: docAsJson(row.doc),
    }))
  )
  return { error: error?.message ?? null }
}
