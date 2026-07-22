import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, VISUALS_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'
import { uploadPostImage, replaceExistingImage } from '@/features/publishing/lib/storage'
import { parseSlides } from '@/components/posts/parse-slides'
import { slideTextBlock } from '@/lib/visual/prompt'
import { generateVisual } from '@/lib/visual/generate-visual'

// One gpt-image-2 generation (~52s) + download + storage upload per request.
export const maxDuration = 120

/** Generate the AI visual for one post position and store it as a regular post image. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(`visuals:${auth.userId}`, VISUALS_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many visual generations. Please wait a few minutes.' }, { status: 429 })
  }

  const post = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let body: { position?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const position = Number(body.position ?? 0)
  if (!Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'position must be a non-negative integer' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: postRow } = await admin
    .from('posts')
    .select('post_type, slides_json, caption')
    .eq('id', postId)
    .single()
  if (!postRow) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const textBlock = slideTextBlock({
    postType: postRow.post_type,
    slides: parseSlides(postRow.slides_json),
    caption: postRow.caption,
    position,
  })
  if (!textBlock) {
    return NextResponse.json({ error: 'No slide copy at this position to generate from' }, { status: 400 })
  }

  try {
    const visual = await generateVisual({ clientId: post.client_id, textBlock })
    const fileName = `visual-${position}.jpg`
    const { publicUrl, storagePath } = await uploadPostImage(
      visual.buffer, fileName, visual.contentType, post.client_id, postId
    )

    // Replace only after a successful generation + upload so a failure never loses the current image.
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ image })
  } catch (err) {
    console.error('[visuals] generation failed:', err)
    const message = err instanceof Error ? err.message : 'Visual generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
