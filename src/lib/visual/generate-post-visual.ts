import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  uploadPostImage,
  putPostImage,
  type ExistingPostImage,
} from '@/features/assets/lib/storage'
import { parseSlides } from '@/lib/posts/parse-slides'
import { slideTextBlock } from '@/lib/visual/prompt'
import { fetchIdentityForGeneration, generateVisual } from '@/lib/visual/generate-visual'
import { resolveScheme } from '@/lib/visual/post-color'
import { totalVisualSlots } from '@/lib/visual/visual-backlog'
import type { PostImageRow } from '@/types/index'

type GeneratePostVisualResult =
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
    .select('post_type, slides_json, caption, visual_ground, visual_accent')
    .eq('id', postId)
    .single()
  if (!postRow) return { ok: false, reason: 'not_found' }

  const slides = parseSlides(postRow.slides_json)
  const textBlock = slideTextBlock({
    postType: postRow.post_type,
    slides,
    caption: postRow.caption,
    position,
  })
  if (!textBlock) return { ok: false, reason: 'no_copy' }

  // ONE read of the client's kit for the whole generation — the scheme and the prompt both need it.
  const identity = await fetchIdentityForGeneration(clientId)
  // `postId` is what makes this claim the pair on the row rather than merely derive one, so a
  // sibling slide generating at the same moment adopts it instead of picking its own.
  const scheme = await resolveScheme({
    clientId,
    identity,
    postId,
    base: postId,
    stored: { ground: postRow.visual_ground, accent: postRow.visual_accent },
  })

  // Read before generating, and read once: its path is both the reroll nonce the prompt needs and
  // the file the write below will orphan.
  const replacing = await existingImageAt(admin, postId, position)

  const visual = await generateVisual({
    identity,
    textBlock,
    scheme,
    variation: {
      subject: postId,
      position,
      // Single posts are a one-slide carousel as far as the rhythm is concerned — the same question
      // the cron asks when it counts a post's slots, so the same function answers it.
      total: totalVisualSlots(postRow),
      nonce: replacing?.storage_path ?? '',
    },
  })
  const fileName = `visual-${position}.jpg`
  const { publicUrl, storagePath } = await uploadPostImage(
    visual.buffer,
    fileName,
    visual.contentType,
    clientId,
    postId
  )

  const image = await putPostImage(
    admin,
    {
      postId,
      position,
      publicUrl,
      storagePath,
      fileName,
      fileSize: visual.buffer.byteLength,
      contentType: visual.contentType,
    },
    replacing
  )

  return { ok: true, image }
}

/**
 * The image this generation is about to replace — ONE read, answering both questions asked of it.
 *
 * Its `storage_path` is the reroll nonce, and it is the path rather than the row's `id` for a
 * reason worth stating. The nonce has to change whenever the picture does. The id used to, because
 * every write here deleted the row and inserted a fresh one; `putPostImage` upserts instead, which
 * KEEPS the id — so a nonce read from it would freeze after the first reroll and every later press
 * would hand back the same framing and the same layout. The storage path cannot: `uploadPostImage`
 * stamps every upload with `Date.now()`, so a new picture is a new path by construction.
 *
 * Empty on a first generation, which keeps that render reproducible: the same post and position
 * always compose the same way until somebody actually asks for something else. (`visuals_attempts`
 * is deliberately not used — it is the cron's retry budget, so borrowing it would let an automatic
 * retry silently redesign the slide.)
 *
 * The same row is then the one `putPostImage` cleans up after, so it is read here and passed along
 * rather than read twice.
 */
async function existingImageAt(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  postId: string,
  position: number
): Promise<ExistingPostImage | null> {
  const { data } = await admin
    .from('post_images')
    .select('storage_path')
    .eq('post_id', postId)
    .eq('position', position)
    .maybeSingle()
  return data
}
