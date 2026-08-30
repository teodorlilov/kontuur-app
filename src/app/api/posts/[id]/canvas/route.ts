import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { POST_CANVAS_DOC_COLUMNS } from '@/lib/queries/select-columns'
import { parseCanvasDoc, safeParseCanvasDoc } from '@/lib/canvas/doc-schema'
import { upsertCanvasDoc } from '@/lib/canvas/doc-store'
import type { CanvasDoc } from '@/types/canvas'
import { fetchVisualIdentityOrDefault } from '@/lib/visual/queries'
import { toSeedIdentity } from '@/lib/visual/identity-schema'
import { deletePostImage, putPostImage, uploadPostImage } from '@/features/assets/lib/storage'
import { validateImageFile } from '@/features/assets/lib/validate-image-file'

/**
 * Every stored canvas doc for a post, plus the identity to seed the slides that have none — in ONE
 * round trip, for every reader.
 *
 * There used to be a `?position=N` form answering for a single slide, because the compose passes
 * work one slide at a time. That was the wrong thing to give them: a five-slide carousel meant five
 * requests, each repeating this ownership join and this identity read to return the same answer.
 * They now read once per pass and index by position in memory, so the per-slide form has no caller
 * and is gone rather than kept "in case".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  // Started together, awaited together. The identity and the docs are independent reads, and the
  // editor cannot open until both land — so serialising them charged the user one round trip for
  // nothing on the one request the whole editor waits on.
  const [identity, { data: rows }] = await Promise.all([
    fetchVisualIdentityOrDefault(post.client_id),
    admin
      .from('post_canvas_docs')
      .select(POST_CANVAS_DOC_COLUMNS)
      .eq('post_id', postId)
      .order('position'),
  ])
  // A malformed/legacy row drops out of the list rather than failing the request — the reader
  // reseeds that slide, exactly as it does for a slide that never had a doc.
  const docs = (rows ?? []).flatMap((row) => {
    const parsed = safeParseCanvasDoc(row.doc)
    return parsed.success ? [{ position: row.position, doc: parsed.doc }] : []
  })
  return NextResponse.json({ docs, identity: toSeedIdentity(identity, post.client_name) })
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

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const fields = parsePutFields(await request.formData())
  if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 })
  const { file, position, doc, baseImagePath } = fields

  const admin = createAdminSupabaseClient()
  // Read once and passed to `putPostImage` below, which needs exactly this row to know which file
  // it orphans — reading it again there was two identical queries per save, and every auto-compose
  // triggers a save.
  const { data: current } = await admin
    .from('post_images')
    .select('storage_path')
    .eq('post_id', postId)
    .eq('position', position)
    .single()

  if (!current || current.storage_path !== baseImagePath) {
    return NextResponse.json(
      {
        error: 'The image changed since the editor was opened. Reopen to edit the latest version.',
      },
      { status: 409 }
    )
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { publicUrl, storagePath } = await uploadPostImage(
      buffer,
      file.name,
      file.type,
      post.client_id,
      postId
    )
    const stored: CanvasDoc = { ...doc, flattenedStoragePath: storagePath }

    await cleanUpStaleBackground(admin, postId, position, doc, current.storage_path, post.client_id)

    const { error: docError } = await upsertCanvasDoc(admin, { postId, position, doc: stored })
    if (docError) return NextResponse.json({ error: docError }, { status: 500 })

    // `preserveStoragePath`: the clean background survives its own row being replaced by the
    // flattened export — the doc still points at it, and the next save re-flattens over it.
    const image = await putPostImage(
      admin,
      {
        postId,
        position,
        publicUrl,
        storagePath,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        preserveStoragePath: doc.background.storagePath,
      },
      current
    )

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
