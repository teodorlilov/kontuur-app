import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { CLIENT_SOURCE_COLUMNS } from '@/lib/queries/select-columns'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { isValidRssUrl } from '@/lib/sources/fetch-rss'
import { fetchWebsiteSource } from '@/lib/sources/fetch-website'
import type { ClientSource } from '@/types/api'
import type { Json } from '@/types/database'

interface AddSourceBody {
  type: 'rss' | 'website'
  label: string
  url: string
  config?: Record<string, unknown>
  focusInstructions?: string
  selectedPages?: string[]
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('client_sources')
    .select(CLIENT_SOURCE_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sources: data as ClientSource[] })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: AddSourceBody
  try {
    body = (await request.json()) as AddSourceBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.type || !body.label?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: 'type, label, and url are required' }, { status: 400 })
  }

  if (!['rss', 'website'].includes(body.type)) {
    return NextResponse.json({ error: 'type must be rss or website' }, { status: 400 })
  }

  if (!validateSourceUrl(body.url)) {
    return NextResponse.json(
      { error: 'Invalid URL — must be a public http/https URL' },
      { status: 400 }
    )
  }

  // Test the URL before saving
  let fetchStatus = 'ok'
  let fetchError: string | undefined

  if (body.type === 'rss') {
    const valid = await isValidRssUrl(body.url)
    if (!valid) {
      fetchStatus = 'error'
      fetchError = 'URL did not return a valid RSS or Atom feed'
    }
  } else {
    const result = await fetchWebsiteSource(body.url)
    if (result.error) {
      fetchStatus = 'error'
      fetchError = result.error
    }
  }

  const sourceConfig = { ...(body.config ?? {}) }
  if (body.type === 'website') {
    if (body.focusInstructions?.trim()) {
      sourceConfig.focus_instructions = body.focusInstructions.trim()
    }
    if (body.selectedPages && body.selectedPages.length > 0) {
      sourceConfig.selected_pages = body.selectedPages
    }
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('client_sources')
    .insert({
      client_id: clientId,
      type: body.type,
      label: body.label.trim(),
      url: body.url.trim(),
      config: sourceConfig as Json,
      last_fetched_at: new Date().toISOString(),
      last_fetch_status: fetchStatus,
      last_fetch_error: fetchError ?? null,
    })
    .select(CLIENT_SOURCE_COLUMNS)
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({
    source: insertedRow as ClientSource,
    fetch_status: fetchStatus,
    fetch_error: fetchError,
  })
}
