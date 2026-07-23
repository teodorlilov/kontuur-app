import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientById } from '@/lib/queries/db'
import {
  deleteDraftVisuals,
  draftVisualPrefix,
  uploadDraftVisual,
} from '@/features/publishing/lib/storage'
import { validateImageFile } from '@/features/publishing/lib/validate-image-file'

/**
 * Upload a browser-composed draft visual (auto-compose or editor save for an in-memory wizard
 * draft). `previousStoragePath` is the draft's previous FLATTENED file to replace — never the
 * doc's clean background, which must survive for re-editing.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const formData = await request.formData()
  const file = formData.get('file') as File | null // FormData.get() returns File | string | null
  const clientId = formData.get('clientId')
  const draftId = formData.get('draftId')
  const position = Number(formData.get('position') ?? 0)
  const previousStoragePath = formData.get('previousStoragePath')

  if (typeof clientId !== 'string' || !clientId || typeof draftId !== 'string' || !draftId) {
    return NextResponse.json({ error: 'clientId and draftId are required' }, { status: 400 })
  }
  if (!Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const fileError = validateImageFile(file)
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

  const client = await fetchClientById(auth.supabase, clientId, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { publicUrl, storagePath } = await uploadDraftVisual(buffer, clientId, draftId, position)

    if (typeof previousStoragePath === 'string' && previousStoragePath.startsWith(draftVisualPrefix(clientId))) {
      await deleteDraftVisuals([previousStoragePath])
    }

    return NextResponse.json({ position, publicUrl, storagePath })
  } catch (err) {
    console.error('[generate-visual/upload] draft upload failed:', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
