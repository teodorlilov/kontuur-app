import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { CLIENT_SOURCE_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientSource } from '@/types/api'
import type { TavilyConfig } from '@/types/sources'
import type { Json } from '@/types/database'

interface UpsertTavilyBody {
  is_active: boolean
  config?: TavilyConfig
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: UpsertTavilyBody
  try {
    body = (await request.json()) as UpsertTavilyBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const config: TavilyConfig = {}
  if (body.config?.include_domains?.length) {
    config.include_domains = body.config.include_domains
  }
  if (body.config?.exclude_domains?.length) {
    config.exclude_domains = body.config.exclude_domains
  }

  // Check if tavily source already exists for this client
  const { data: existing } = await supabase
    .from('client_sources')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'tavily')
    .single()

  if (existing) {
    // Update existing tavily source
    const { error } = await supabase
      .from('client_sources')
      .update({ is_active: body.is_active, config: config as unknown as Json })
      .eq('id', existing.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ source: { id: existing.id } })
  }

  // Create new tavily source
  const { data: inserted, error: insertError } = await supabase
    .from('client_sources')
    .insert({
      client_id: clientId,
      type: 'tavily',
      label: 'Web Search',
      url: '',
      is_active: body.is_active,
      config: config as unknown as Json,
    })
    .select(CLIENT_SOURCE_COLUMNS)
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ source: inserted as unknown as ClientSource })
}
