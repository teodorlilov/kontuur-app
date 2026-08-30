import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import { uploadPostImage, deletePostImage, putPostImage } from '@/features/assets/lib/storage'
import { validateImageFile } from '@/features/assets/lib/validate-image-file'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { toJpeg } from '@/lib/visual/to-jpeg'
import { POST_IMAGE_STORAGE_COLUMNS } from '@/lib/queries/select-columns'

const deleteImageSchema = z.object({ imageId: z.uuid() })

/** Upload an image for a post (linked to a carousel slide position or single post). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null // FormData.get() returns File | string | null
  const position = Number(formData.get('position') ?? 0)

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const fileError = validateImageFile(file)
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

  // The picker accepts PNG/WebP for convenience, but Instagram containers take
  // JPEG only — convert at the boundary so a slide can never fail at publish.
  const jpeg = await toJpeg(Buffer.from(await file.arrayBuffer()), file.type, file.name)
  const { publicUrl, storagePath } = await uploadPostImage(
    jpeg.buffer,
    jpeg.fileName,
    jpeg.contentType,
    post.client_id,
    postId
  )

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
    console.error('[images] upload failed:', err)
    const message = err instanceof Error ? err.message : 'Could not save the image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Delete a post image by its ID. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const parsed = deleteImageSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'imageId required' }, { status: 400 })
  const body = parsed.data

  const admin = createAdminSupabaseClient()
  const { data: image } = await admin
    .from('post_images')
    .select(POST_IMAGE_STORAGE_COLUMNS)
    .eq('id', body.imageId)
    .eq('post_id', postId)
    .single()

  if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

  await deletePostImage(image.storage_path)
  await admin.from('post_images').delete().eq('id', image.id)

  return NextResponse.json({ success: true })
}
