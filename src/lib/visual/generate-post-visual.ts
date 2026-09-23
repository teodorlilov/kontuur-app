import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  deletePostImage,
  uploadPostImage,
  putPostImage,
  type ExistingPostImage,
} from '@/features/assets/lib/storage'
import { parseSlides } from '@/lib/posts/parse-slides'
import { slideTextBlock } from '@/lib/visual/prompt'
import { fetchIdentityForGeneration, generateVisual } from '@/lib/visual/generate-visual'
import { resolveScheme } from '@/lib/visual/post-color'
import { totalVisualSlots } from '@/lib/visual/visual-backlog'
import { claimVisualJob, releaseVisualJob } from '@/lib/visual/visual-jobs'
import type { PostImageRow } from '@/types/index'

type GeneratePostVisualResult =
  | { ok: true; image: PostImageRow }
  | { ok: false; reason: 'not_found' | 'no_copy' | 'in_flight' }

/**
 * Generate the AI visual for one post position and store it as a regular
 * post image — the single server path shared by the visuals endpoint and the
 * visuals cron. Missing posts and copy-less positions return a typed refusal;
 * generation and storage failures throw for the caller's boundary to log, and
 * so does an exhausted image allowance (`AllowanceError`, src/lib/billing/usage.ts),
 * which the route answers with a 402 and the cron counts as a skip. The caller
 * declares who is spending with `runMetered` (src/lib/billing/usage.ts) before calling — the
 * plain `runAsSpender` is refused by the paid model, since nobody would settle its reservation.
 *
 * The position is CLAIMED before the model is called (`lib/visual/visual-jobs.ts`) and released
 * when this returns, however it returns. A position already being generated refuses as
 * `in_flight` before anything is spent: a picture leaves no trace until it lands, so without the
 * claim a resumed run, a second tab or the cron beside a person all ask for the same slide again
 * and the workspace pays twice for the one picture that survives.
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

  if (!(await claimVisualJob(admin, postId, position))) return { ok: false, reason: 'in_flight' }
  try {
    return await generateClaimedVisual({
      admin,
      postId,
      clientId,
      position,
      identity: await fetchIdentityForGeneration(clientId),
      textBlock,
      postRow,
    })
  } finally {
    await releaseVisualJob(admin, postId, position)
  }
}

/**
 * The generation itself, with the position already claimed: colours, picture, file, row.
 *
 * Split from the claim so that every exit — the throw of a failed generation as much as a
 * finished picture — passes through one `finally` that gives the position back. A claim this
 * function leaked would make the slide look busy until it aged out.
 */
async function generateClaimedVisual(input: {
  admin: ReturnType<typeof createAdminSupabaseClient>
  postId: string
  clientId: string
  position: number
  identity: Awaited<ReturnType<typeof fetchIdentityForGeneration>>
  textBlock: string
  postRow: {
    post_type: string
    slides_json: unknown
    visual_ground: string | null
    visual_accent: string | null
  }
}): Promise<GeneratePostVisualResult> {
  const { admin, postId, clientId, position, identity, textBlock, postRow } = input
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

  try {
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
  } catch (err) {
    // The file is ours and nothing points at it: the row that would have is the write that just
    // failed. The commonest cause is the post being discarded during the ~52s this took, which
    // leaves the picture in the deleted post's folder after `deletePost` already swept it. Deleted
    // whatever the cause rather than on a foreign-key code, because an unreferenced file is garbage
    // either way. Best-effort by contract, then the failure goes on to the caller's boundary.
    await deletePostImage(storagePath)
    throw err
  }
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
