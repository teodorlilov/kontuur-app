import { toJpeg } from '@/lib/visual/to-jpeg'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import { canvaFetch, CanvaAuthError } from '../../../canva-auth'
import { CANVA_API_BASE } from '../../../canva-constants'
import { uploadPostImage, putPostImage } from '@/features/publishing/lib/storage'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { MAX_CAROUSEL_SLIDES } from '@/utils/constants'

/**
 * `position` is the carousel slot the export lands in. Bounded by MAX_CAROUSEL_SLIDES
 * because it is written to `post_images.position`, which has a unique constraint per
 * post — an out-of-range value would insert a row no surface ever reads.
 */
const exportDesignSchema = z.object({
  postId: z.uuid(),
  position: z.number().int().min(0).max(MAX_CAROUSEL_SLIDES),
})

interface CanvaExportJob {
  job: { id: string; status: string }
}

interface CanvaExportResult {
  job: {
    id: string
    status: 'success' | 'failed' | 'in_progress'
    urls?: string[]
    error?: { code: string; message: string }
  }
}

/**
 * POST /api/canva/designs/[designId]/export
 * Body: { postId, position }
 *
 * Exports a Canva design as PNG, downloads it, and uploads to Supabase Storage
 * as a post image at the given position. Uses the current user's Canva token.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ designId: string }> }
) {
  const { designId } = await params

  const parsed = exportDesignSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'postId and position are required' }, { status: 400 })
  }
  const { postId, position } = parsed.data

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // 1. Start export job
  let exportRes: Response
  try {
    exportRes = await canvaFetch(auth.userId, `${CANVA_API_BASE}/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_id: designId,
        format: { type: 'png', as_single_image: true },
      }),
    })
  } catch (err) {
    if (err instanceof CanvaAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    throw err
  }

  if (!exportRes.ok) {
    const err = await exportRes.text()
    console.error('Canva export start failed:', err)
    return NextResponse.json({ error: 'Failed to start Canva export' }, { status: 502 })
  }

  const exportJob = (await exportRes.json()) as CanvaExportJob

  // 2. Poll for completion (max 30 seconds)
  let result: CanvaExportResult | null = null
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))

    let pollRes: Response
    try {
      pollRes = await canvaFetch(auth.userId, `${CANVA_API_BASE}/exports/${exportJob.job.id}`)
    } catch {
      continue
    }

    if (!pollRes.ok) continue
    const pollData = (await pollRes.json()) as CanvaExportResult

    if (pollData.job.status === 'success') {
      result = pollData
      break
    }
    if (pollData.job.status === 'failed') {
      return NextResponse.json(
        { error: pollData.job.error?.message ?? 'Canva export failed' },
        { status: 502 }
      )
    }
  }

  if (!result?.job.urls?.length) {
    return NextResponse.json({ error: 'Canva export timed out' }, { status: 504 })
  }

  // 3. Download the exported image
  const imageUrl = result.job.urls[0]!
  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) {
    return NextResponse.json({ error: 'Failed to download exported image' }, { status: 502 })
  }

  // Canva exports PNG; Instagram containers accept JPEG only, so a PNG slide
  // burned every publish attempt with an opaque media error. Convert here,
  // at the boundary where the PNG enters the post pipeline.
  const jpeg = await toJpeg(
    Buffer.from(await imageRes.arrayBuffer()),
    'image/png',
    `canva-${designId}.png`
  )

  // 4. Upload to Supabase Storage
  const { publicUrl, storagePath } = await uploadPostImage(
    jpeg.buffer,
    jpeg.fileName,
    jpeg.contentType,
    post.client_id,
    postId
  )

  // 5. Replace whatever the position holds — through the one writer, which upserts rather than
  //    deleting first, so a failure here cannot leave the slide with no image at all.
  const admin = createAdminSupabaseClient()
  try {
    const image = await putPostImage(admin, {
      postId,
      position,
      publicUrl,
      storagePath,
      fileName: jpeg.fileName,
      fileSize: jpeg.buffer.byteLength,
      contentType: jpeg.contentType,
    })
    return NextResponse.json({ image })
  } catch (err) {
    console.error('[canva/export] could not save the exported image:', err)
    const message = err instanceof Error ? err.message : 'Could not save the exported image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
