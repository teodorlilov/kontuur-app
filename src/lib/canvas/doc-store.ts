import 'server-only'

import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CanvasDoc } from '@/types/canvas'
import { asJson } from '@/lib/queries/as-json'

type Admin = ReturnType<typeof createAdminSupabaseClient>

/**
 * The only writer of `post_canvas_docs`. Both call sites used to carry their own
 * `as unknown as Json` cast, which is the kind of thing that quietly stops matching the column.
 * The cast itself now lives in `lib/queries/as-json` with every other jsonb write.
 */
/** Save the doc for one slide position, replacing whatever was there. */
export async function upsertCanvasDoc(
  admin: Admin,
  row: { postId: string; position: number; doc: CanvasDoc }
): Promise<{ error: string | null }> {
  const { error } = await admin.from('post_canvas_docs').upsert(
    {
      post_id: row.postId,
      position: row.position,
      doc: asJson(row.doc),
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
      doc: asJson(row.doc),
    }))
  )
  return { error: error?.message ?? null }
}
