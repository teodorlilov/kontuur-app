import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifySourceOwnership } from '@/lib/auth/helpers'

interface PatchSourceBody {
  is_active?: boolean
  label?: string
  url?: string
  config?: Record<string, unknown>
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { sourceId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifySourceOwnership(supabase, sourceId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: PatchSourceBody
  try {
    body = await request.json() as PatchSourceBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.label !== undefined && body.label.trim()) updates.label = body.label.trim()
  if (body.url !== undefined && body.url.trim()) updates.url = body.url.trim()
  if (body.config !== undefined) updates.config = body.config

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('client_sources')
    .update(updates)
    .eq('id', sourceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { sourceId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifySourceOwnership(supabase, sourceId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check if this is a file source — if so, delete the storage file first
  const { data: sourceRow } = await supabase
    .from('client_sources')
    .select('type, file_path')
    .eq('id', sourceId)
    .single()

  const source = sourceRow as { type: string; file_path: string | null } | null
  if (source?.type === 'file' && source.file_path) {
    const admin = createAdminSupabaseClient()
    await admin.storage.from('client-files').remove([source.file_path])
  }

  const { error } = await supabase
    .from('client_sources')
    .delete()
    .eq('id', sourceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
