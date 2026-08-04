import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'
import { uploadPostImage, replaceExistingImage } from '@/features/publishing/lib/storage'
import { parseSlides } from '@/components/posts/parse-slides'
import { slideTextBlock } from '@/lib/visual/prompt'
import { generateVisual } from '@/lib/visual/generate-visual'
import type { PostImageRow } from '@/types/index'

export type GeneratePostVisualResult =
  | { ok: true; image: PostImageRow }
  | { ok: false; reason: 'not_found' | 'no_copy' }

/**
 * Generate the AI visual for one post position and store it as a regular
 * post image — the single server path shared by the visuals endpoint and the
 * visuals cron. Missing posts and copy-less positions return a typed refusal;
 * generation and storage failures throw for the caller's boundary to log.
 */
export async function generatePostVisual(input: {
  postId: string
  clientId: string
  position: number
}): Promise<GeneratePostVisualResult> {
  const { postId, clientId, position } = input
  const admin = createAdminSupabaseClient()

  const { data: postRow } = await admin
    .from('posts')
    .select('post_type, slides_json, caption')
    .eq('id', postId)
    .single()
  if (!postRow) return { ok: false, reason: 'not_found' }

  const textBlock = slideTextBlock({
    postType: postRow.post_type,
    slides: parseSlides(postRow.slides_json),
    caption: postRow.caption,
    position,
  })
  if (!textBlock) return { ok: false, reason: 'no_copy' }

  const visual = await generateVisual({ clientId, textBlock })
  const fileName = `visual-${position}.jpg`
  const { publicUrl, storagePath } = await uploadPostImage(
    visual.buffer,
    fileName,
    visual.contentType,
    clientId,
    postId
  )

  // Replace only after a successful generation + upload so a failure never
  // loses the current image.
  await replaceExistingImage(admin, postId, position)
  const { data: image, error } = await admin
    .from('post_images')
    .insert({
      post_id: postId,
      public_url: publicUrl,
      storage_path: storagePath,
      position,
      file_name: fileName,
      file_size: visual.buffer.byteLength,
      content_type: visual.contentType,
    })
    .select(POST_IMAGE_COLUMNS)
    .single()
  if (error) throw new Error(`post_images insert failed: ${error.message}`)

  return { ok: true, image: image as PostImageRow }
}
