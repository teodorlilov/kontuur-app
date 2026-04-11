import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import { extractText } from '@/lib/sources/extract-text'
import { validateUpload, getFileExtension } from '@/lib/sources/validate-upload'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const label = (formData.get('label') as string | null)?.trim()

  const validation = validateUpload(
    file ? { type: file.type, size: file.size, name: file.name } : null,
    label
  )
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // After validation, file and label are guaranteed non-null
  const validFile = file!
  const validLabel = label!

  // Convert to buffer and extract text
  const buffer = Buffer.from(await validFile.arrayBuffer())
  const { text: extractedText, error: extractionError } = await extractText(buffer, validFile.type)

  if (extractionError && !extractedText) {
    return NextResponse.json(
      { error: `Text extraction failed: ${extractionError}` },
      { status: 400 }
    )
  }

  // Upload file to Supabase Storage using admin client
  const admin = createAdminSupabaseClient()
  const ext = getFileExtension(validFile.name)
  const filePath = `${clientId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage.from('client-files').upload(filePath, buffer, {
    contentType: validFile.type,
    upsert: false,
  })

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 })
  }

  // Insert client_sources row
  const { data: sourceData, error: insertError } = await admin
    .from('client_sources')
    .insert({
      client_id: clientId,
      type: 'file',
      label: validLabel,
      url: validFile.name,
      file_path: filePath,
      extracted_text: extractedText,
      is_active: true,
      last_fetched_at: new Date().toISOString(),
      last_fetch_status: 'ok',
      last_fetch_error: extractionError ?? null,
      config: {},
    })
    .select(CLIENT_SOURCE_FULL_COLUMNS)
    .single()

  if (insertError || !sourceData) {
    // Clean up uploaded file
    await admin.storage.from('client-files').remove([filePath])
    return NextResponse.json({ error: 'Failed to create source record' }, { status: 500 })
  }

  return NextResponse.json({ source: sourceData })
}
