import 'server-only'

import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CanvasDoc } from '@/types/canvas'
import { asJson } from '@/lib/queries/as-json'

type Admin = ReturnType<typeof createAdminSupabaseClient>

/**
 * The only writer of `post_canvas_docs`: save the doc for one slide position, replacing whatever
 * was there. The jsonb cast lives in `lib/queries/as-json` with every other jsonb write.
 */
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
