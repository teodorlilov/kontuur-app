import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { canvaFetch, CanvaAuthError } from '../../../canva-auth'
import { CANVA_API_BASE } from '../../../canva-constants'
import { uploadPostImage, deletePostImage } from '@/features/publishing/lib/storage'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'

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

  let body: { postId: string; position: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { postId, position } = body
  if (!postId || position == null) {
    return NextResponse.json({ error: 'postId and position are required' }, { status: 400 })
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
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

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
  const fileName = `canva-${designId}.png`

  // 4. Upload to Supabase Storage
  const { publicUrl, storagePath } = await uploadPostImage(
    imageBuffer,
    fileName,
    'image/png',
    post.client_id,
    postId
  )

  // 5. Replace existing image at position (if any) and create DB record
  const admin = createAdminSupabaseClient()

  const { data: existing } = await admin
    .from('post_images')
    .select('id, storage_path')
    .eq('post_id', postId)
    .eq('position', position)
    .single()

  if (existing) {
    await deletePostImage(existing.storage_path)
    await admin.from('post_images').delete().eq('id', existing.id)
  }

  const { data: image, error } = await admin
    .from('post_images')
    .insert({
      post_id: postId,
      public_url: publicUrl,
      storage_path: storagePath,
      position,
      file_name: fileName,
      file_size: imageBuffer.byteLength,
      content_type: 'image/png',
    })
    .select(POST_IMAGE_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ image })
}
