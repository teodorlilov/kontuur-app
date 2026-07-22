import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { uploadPostImage, deletePostImage, replaceExistingImage } from '@/features/publishing/lib/storage'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'

const MAX_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

/** Validate the uploaded file type and size. */
function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'Only JPEG and PNG files are accepted'
  if (file.size > MAX_SIZE_BYTES) return 'File must be under 8 MB'
  return null
}

/** Upload an image for a post (linked to a carousel slide position or single post). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null // FormData.get() returns File | string | null
  const position = Number(formData.get('position') ?? 0)

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const fileError = validateFile(file)
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { publicUrl, storagePath } = await uploadPostImage(buffer, file.name, file.type, post.client_id, postId)

  const admin = createAdminSupabaseClient()
  await replaceExistingImage(admin, postId, position)

  const { data: image, error } = await admin
    .from('post_images')
    .insert({ post_id: postId, public_url: publicUrl, storage_path: storagePath, position, file_name: file.name, file_size: file.size, content_type: file.type })
    .select(POST_IMAGE_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ image })
}

/** Delete a post image by its ID. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let body: { imageId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.imageId) return NextResponse.json({ error: 'imageId required' }, { status: 400 })

  const admin = createAdminSupabaseClient()
  const { data: image } = await admin
    .from('post_images')
    .select('id, storage_path')
    .eq('id', body.imageId)
    .eq('post_id', postId)
    .single()

  if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

  await deletePostImage(image.storage_path)
  await admin.from('post_images').delete().eq('id', image.id)

  return NextResponse.json({ success: true })
}
