import 'server-only'
import { uploadPostImage } from '@/features/publishing/lib/storage'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { renderSlidesServerSide } from './server-render'

/**
 * Render a post's slides server-side and upsert them into `post_images` — the autonomous publish render
 * for cron posts (no operator, no browser). Mirrors the client export (JPEG at each slide position,
 * replace-in-place). Fail-soft throughout; gated by the caller (env flag), so it's a no-op unless enabled.
 */
export async function renderAndUploadPostImages(params: {
  postId: string
  clientId: string
  slides: Array<{ slideIndex: number; composition: Composition }>
  tokens: BrandTokens
}): Promise<void> {
  const rendered = await renderSlidesServerSide(params.slides, params.tokens)
  if (rendered.length === 0) return

  const db = createUntypedAdminClient()
  for (const { slideIndex, buffer } of rendered) {
    try {
      const fileName = `slide-${slideIndex + 1}.jpg`
      const { publicUrl, storagePath } = await uploadPostImage(buffer, fileName, 'image/jpeg', params.clientId, params.postId)

      // Replace any existing image at this position (a regenerate), then insert the new row.
      const { data: existing } = await db
        .from('post_images')
        .select('id')
        .eq('post_id', params.postId)
        .eq('position', slideIndex)
        .maybeSingle()
      if (existing) await db.from('post_images').delete().eq('id', (existing as { id: string }).id)

      await db.from('post_images').insert({
        post_id: params.postId,
        public_url: publicUrl,
        storage_path: storagePath,
        position: slideIndex,
        file_name: fileName,
        file_size: buffer.length,
        content_type: 'image/jpeg',
      })
    } catch (e) {
      console.error('[server-export] upload failed for slide', slideIndex, e)
    }
  }
}
