import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { assetTargetFromForm, resolveAssetDestination } from '@/features/publishing/lib/asset-destination'
import { validateImageFile } from '@/features/publishing/lib/validate-image-file'

/**
 * Upload a user-provided canvas-element asset (logo/graphic) for a persisted post or an
 * in-memory wizard draft. Returns the stored ref the element embeds in its doc.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const formData = await request.formData()
  const file = formData.get('file') as File | null // FormData.get() returns File | string | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const fileError = validateImageFile(file)
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

  const destination = await resolveAssetDestination(auth.supabase, auth.agencyId, assetTargetFromForm(formData))
  if (!destination.ok) return NextResponse.json({ error: destination.error }, { status: destination.status })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { publicUrl, storagePath } = await destination.upload(buffer, file.type, file.name)
    return NextResponse.json({ publicUrl, storagePath })
  } catch (err) {
    console.error('[canvas-asset] upload failed:', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
