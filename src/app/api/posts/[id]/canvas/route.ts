import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_CANVAS_DOC_COLUMNS, POST_IMAGE_COLUMNS } from '@/lib/queries/select-columns'
import { parseCanvasDoc, safeParseCanvasDoc } from '@/lib/canvas/doc-schema'
import type { CanvasDoc } from '@/types/canvas'
import { fetchVisualIdentityOrDefault } from '@/lib/visual/queries'
import {
  deletePostImage,
  replaceExistingImage,
  uploadPostImage,
} from '@/features/publishing/lib/storage'
import { validateImageFile } from '@/features/publishing/lib/validate-image-file'
import type { Json } from '@/types/database'

/** The canvas doc + identity for one position — everything the editor needs in one round trip. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const position = Number(new URL(request.url).searchParams.get('position') ?? 0)
  if (!Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: row } = await admin
    .from('post_canvas_docs')
    .select(POST_CANVAS_DOC_COLUMNS)
    .eq('post_id', postId)
    .eq('position', position)
    .single()

  // A malformed/legacy doc reads as "no doc" — the editor reseeds instead of erroring.
  const parsed = row ? safeParseCanvasDoc(row.doc) : null
  const doc = parsed?.success ? parsed.doc : null

  const identity = await fetchVisualIdentityOrDefault(post.client_id)
  return NextResponse.json({ doc, identity: { palette: identity.palette, style: identity.style } })
}

interface PutFields {
  file: File
  position: number
  doc: CanvasDoc
  baseImagePath: string
}

function parsePutFields(formData: FormData): PutFields | string {
  const file = formData.get('file') as File | null // FormData.get() returns File | string | null
  if (!file) return 'No file provided'
  const fileError = validateImageFile(file)
  if (fileError) return fileError

  const position = Number(formData.get('position') ?? 0)
  if (!Number.isInteger(position) || position < 0) return 'Invalid position'

  const baseImagePath = formData.get('baseImagePath')
  if (typeof baseImagePath !== 'string' || !baseImagePath) return 'baseImagePath is required'

  const rawDoc = formData.get('doc')
  if (typeof rawDoc !== 'string') return 'doc is required'
  try {
    return { file, position, doc: parseCanvasDoc(JSON.parse(rawDoc)), baseImagePath }
  } catch {
    return 'doc is not a valid canvas document'
  }
}

/**
 * Save an edited slide in one request: the flattened jpeg replaces the image at the position and
 * the canvas doc is upserted, so the two can never drift. 409 when the image changed underneath
 * (regenerate/re-upload since the editor opened) — the client reopens against the fresh background.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await verifyPostOwnership(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const fields = parsePutFields(await request.formData())
  if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 })
  const { file, position, doc, baseImagePath } = fields

  const admin = createAdminSupabaseClient()
  const { data: current } = await admin
    .from('post_images')
    .select('storage_path')
    .eq('post_id', postId)
    .eq('position', position)
    .single()

  if (!current || current.storage_path !== baseImagePath) {
    return NextResponse.json(
      { error: 'The image changed since the editor was opened. Reopen to edit the latest version.' },
      { status: 409 }
    )
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { publicUrl, storagePath } = await uploadPostImage(buffer, file.name, file.type, post.client_id, postId)
    const stored: CanvasDoc = { ...doc, flattenedStoragePath: storagePath }

    await cleanUpStaleBackground(admin, postId, position, doc, current.storage_path, post.client_id)

    const { error: docError } = await admin
      .from('post_canvas_docs')
      .upsert(
        { post_id: postId, position, doc: stored as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: 'post_id,position' }
      )
    if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })

    // The clean background survives its own row being replaced by the flattened export.
    await replaceExistingImage(admin, postId, position, doc.background.storagePath)

    const { data: image, error } = await admin
      .from('post_images')
      .insert({
        post_id: postId,
        public_url: publicUrl,
        storage_path: storagePath,
        position,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type,
      })
      .select(POST_IMAGE_COLUMNS)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ image })
  } catch (err) {
    console.error('[canvas] save failed:', err)
    const message = err instanceof Error ? err.message : 'Canvas save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** When a save rebinds the doc to a new background, best-effort delete the orphaned old clean file. */
async function cleanUpStaleBackground(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  postId: string,
  position: number,
  incoming: CanvasDoc,
  currentImagePath: string,
  clientId: string
): Promise<void> {
  const { data: row } = await admin
    .from('post_canvas_docs')
    .select('doc')
    .eq('post_id', postId)
    .eq('position', position)
    .single()
  if (!row) return
  const parsed = safeParseCanvasDoc(row.doc)
  if (!parsed.success) return
  const stale = parsed.doc.background.storagePath
  const isOrphaned =
    stale !== incoming.background.storagePath &&
    stale !== currentImagePath &&
    stale.startsWith(`${clientId}/`) // never delete outside this client's space
  if (isOrphaned) await deletePostImage(stale)
}
