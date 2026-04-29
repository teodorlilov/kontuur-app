'use server'

import { randomUUID } from 'crypto'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveActionAuth, verifyClientOwnership, verifySourceOwnership } from '@/lib/auth/helpers'
import { CLIENT_SOURCE_COLUMNS, CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { isValidRssUrl } from '@/lib/sources/fetch-rss'
import { fetchWebsiteSource } from '@/lib/sources/fetch-website'
import { extractText } from '@/lib/sources/extract-text'
import { validateUpload, getFileExtension } from '@/lib/sources/validate-upload'
import type { ClientSource } from '@/types/api'
import type { TavilyConfig } from '@/types/sources'
import type { Json } from '@/types/database'
import type { ActionResult } from '@/lib/actions/types'

interface CreateSourceInput {
  type: 'rss' | 'website'
  label: string
  url: string
  config?: Record<string, unknown>
  focusInstructions?: string
  selectedPages?: string[]
}

/** Create an RSS or website source for a client. */
export async function createSource(
  clientId: string,
  input: CreateSourceInput
): Promise<ActionResult<{ source: ClientSource; fetchStatus: string; fetchError?: string }>> {
  try {
    const auth = await resolveActionAuth()
    if (!auth.ok) return { ok: false, error: auth.error }
    const { supabase, agencyId } = auth

    const owned = await verifyClientOwnership(supabase, clientId, agencyId)
    if (!owned) return { ok: false, error: 'Not found' }

    if (!input.type || !input.label?.trim() || !input.url?.trim()) {
      return { ok: false, error: 'type, label, and url are required' }
    }

    if (!['rss', 'website'].includes(input.type)) {
      return { ok: false, error: 'type must be rss or website' }
    }

    if (!validateSourceUrl(input.url)) {
      return { ok: false, error: 'Invalid URL — must be a public http/https URL' }
    }

    // Test the URL before saving
    let fetchStatus = 'ok'
    let fetchError: string | undefined

    if (input.type === 'rss') {
      const valid = await isValidRssUrl(input.url)
      if (!valid) {
        fetchStatus = 'error'
        fetchError = 'URL did not return a valid RSS or Atom feed'
      }
    } else {
      const result = await fetchWebsiteSource(input.url)
      if (result.error) {
        fetchStatus = 'error'
        fetchError = result.error
      }
    }

    const sourceConfig = { ...(input.config ?? {}) }
    if (input.type === 'website') {
      if (input.focusInstructions?.trim()) {
        sourceConfig.focus_instructions = input.focusInstructions.trim()
      }
      if (input.selectedPages && input.selectedPages.length > 0) {
        sourceConfig.selected_pages = input.selectedPages
      }
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from('client_sources')
      .insert({
        client_id: clientId,
        type: input.type,
        label: input.label.trim(),
        url: input.url.trim(),
        config: sourceConfig as Json,
        last_fetched_at: new Date().toISOString(),
        last_fetch_status: fetchStatus,
        last_fetch_error: fetchError ?? null,
      })
      .select(CLIENT_SOURCE_COLUMNS)
      .single()

    if (insertError) return { ok: false, error: insertError.message }

    revalidateTag('agency-clients', 'max')
    return {
      ok: true,
      data: {
        source: insertedRow as unknown as ClientSource,
        fetchStatus,
        fetchError,
      },
    }
  } catch (err) {
    console.error('[createSource]', err)
    return { ok: false, error: 'Failed to create source' }
  }
}

/** Upload a file source (PDF/TXT) for a client. */
export async function uploadSource(
  clientId: string,
  formData: FormData
): Promise<ActionResult<ClientSource>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const file = formData.get('file') as File | null
  const label = (formData.get('label') as string | null)?.trim()

  const validation = validateUpload(
    file ? { type: file.type, size: file.size, name: file.name } : null,
    label
  )
  if (!validation.valid) {
    return { ok: false, error: validation.error! }
  }

  const validFile = file!
  const validLabel = label!

  const buffer = Buffer.from(await validFile.arrayBuffer())
  const { text: extractedText, error: extractionError } = await extractText(buffer, validFile.type)

  if (extractionError && !extractedText) {
    return { ok: false, error: `Text extraction failed: ${extractionError}` }
  }

  const admin = createAdminSupabaseClient()
  const ext = getFileExtension(validFile.name)
  const filePath = `${clientId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage.from('client-files').upload(filePath, buffer, {
    contentType: validFile.type,
    upsert: false,
  })

  if (uploadError) return { ok: false, error: 'Failed to upload file to storage' }

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
    await admin.storage.from('client-files').remove([filePath])
    return { ok: false, error: 'Failed to create source record' }
  }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: sourceData as unknown as ClientSource }
}

interface UpdateSourceInput {
  is_active?: boolean
  label?: string
  url?: string
  config?: Record<string, unknown>
  pillar_ids?: string[]
}

/** Update a source's fields. */
export async function updateSource(
  sourceId: string,
  updates: UpdateSourceInput
): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifySourceOwnership(supabase, sourceId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const fields: Record<string, unknown> = {}
  if (updates.is_active !== undefined) fields.is_active = updates.is_active
  if (updates.label !== undefined && updates.label.trim()) fields.label = updates.label.trim()
  if (updates.url !== undefined && updates.url.trim()) fields.url = updates.url.trim()
  if (updates.config !== undefined) fields.config = updates.config
  if (updates.pillar_ids !== undefined) fields.pillar_ids = updates.pillar_ids

  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'No valid fields to update' }
  }

  const { error } = await supabase.from('client_sources').update(fields).eq('id', sourceId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}

/** Delete a source by ID. Cleans up storage for file sources. */
export async function deleteSource(sourceId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifySourceOwnership(supabase, sourceId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

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

  const { error } = await supabase.from('client_sources').delete().eq('id', sourceId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}

/** Upsert a Tavily web search source for a client. */
export async function upsertTavilySource(
  clientId: string,
  input: { is_active: boolean; config?: TavilyConfig }
): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const config: TavilyConfig = {}
  if (input.config?.include_domains?.length) {
    config.include_domains = input.config.include_domains
  }
  if (input.config?.exclude_domains?.length) {
    config.exclude_domains = input.config.exclude_domains
  }

  const { data: existing } = await supabase
    .from('client_sources')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'tavily')
    .single()

  if (existing) {
    const { error } = await supabase
      .from('client_sources')
      .update({ is_active: input.is_active, config: config as unknown as Json })
      .eq('id', existing.id)

    if (error) return { ok: false, error: error.message }

    revalidateTag('agency-clients', 'max')
    return { ok: true, data: { id: existing.id } }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('client_sources')
    .insert({
      client_id: clientId,
      type: 'tavily',
      label: 'Web Search',
      url: '',
      is_active: input.is_active,
      config: config as unknown as Json,
    })
    .select(CLIENT_SOURCE_COLUMNS)
    .single()

  if (insertError) return { ok: false, error: insertError.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: { id: (inserted as unknown as ClientSource).id } }
}
