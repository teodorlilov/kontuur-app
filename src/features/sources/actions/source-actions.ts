'use server'

import 'server-only'
import { randomUUID } from 'crypto'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchOwnedSource, resolveActionAuth, verifyClientOwnership } from '@/lib/auth/helpers'
import { CLIENT_SOURCE_COLUMNS, CLIENT_SOURCE_FULL_COLUMNS } from '@/lib/queries/select-columns'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { isValidRssUrl } from '@/lib/sources/fetch-rss'
import { fetchWebsiteSource } from '@/lib/sources/fetch-website'
import { validateUpload, getFileExtension } from '@/lib/sources/validate-upload'
import { CLIENT_FILES_BUCKET } from '@/utils/constants'
import { webResearchSourceRow } from '@/lib/sources/web-research-source'
import type { ClientSource } from '@/types/api'
import type { TavilyConfig } from '@/types/sources'
import { asJson } from '@/lib/queries/as-json'
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

  const createUrl = await resolveSourceUrl(input.url)
  if (!createUrl) return { ok: false, error: INVALID_URL }

  // Test the URL before saving
  let fetchStatus = 'ok'
  let fetchError: string | undefined

  if (input.type === 'rss') {
    const valid = await isValidRssUrl(createUrl)
    if (!valid) {
      fetchStatus = 'error'
      fetchError = 'URL did not return a valid RSS or Atom feed'
    }
  } else {
    const result = await fetchWebsiteSource(createUrl)
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
      url: createUrl,
      config: asJson(sourceConfig),
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
  const { extractText } = await import('@/lib/sources/extract-text')
  const { text: extractedText, error: extractionError } = await extractText(buffer, validFile.type)

  if (extractionError && !extractedText) {
    return { ok: false, error: `Text extraction failed: ${extractionError}` }
  }

  const admin = createAdminSupabaseClient()
  const ext = getFileExtension(validFile.name)
  const filePath = `${clientId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from(CLIENT_FILES_BUCKET)
    .upload(filePath, buffer, {
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
    await admin.storage.from(CLIENT_FILES_BUCKET).remove([filePath])
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

/** The one refusal both paths give, so an edit and an add reject the same address the same way. */
const INVALID_URL = 'Invalid URL — must be a public http/https URL'

/**
 * The trimmed URL if the server may fetch it, else null.
 *
 * Every write of `client_sources.url` goes through here. It existed only inside `createSource`,
 * which meant the SSRF check was a property of ONE ENTRY POINT rather than of the column — and the
 * other entry point wrote a bare `.trim()` straight in. The research pipeline does not know which
 * path produced the row it is fetching.
 */
async function resolveSourceUrl(raw: string): Promise<string | null> {
  const url = raw.trim()
  if (!url) return null
  return (await validateSourceUrl(url)) ? url : null
}

/** Update a source's fields. */
export async function updateSource(
  sourceId: string,
  updates: UpdateSourceInput
): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await fetchOwnedSource(supabase, sourceId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  // The tavily row is reachable here because the sources page renders it with the generic
  // SourceRow. `is_active` and `config` on that row belong to setWebResearch, which filters config
  // to the keys the search reads — this path wrote whatever object it was handed. `pillar_ids` and
  // `label` are the same idea for every source and still pass through.
  if (
    owned.type === 'tavily' &&
    (updates.is_active !== undefined || updates.config !== undefined)
  ) {
    return { ok: false, error: 'Web research is configured through its own controls' }
  }

  const fields: Record<string, unknown> = {}
  if (updates.is_active !== undefined) fields.is_active = updates.is_active
  if (updates.label !== undefined && updates.label.trim()) fields.label = updates.label.trim()
  // Through the same gate `createSource` uses. This branch was `updates.url.trim()` and nothing
  // else, so the SSRF guard was bypassable by EDITING a source instead of adding one: the research
  // pipeline fetches whatever this column holds, and only the create path checked it.
  if (updates.url !== undefined && updates.url.trim()) {
    const url = await resolveSourceUrl(updates.url)
    if (!url) return { ok: false, error: INVALID_URL }
    fields.url = url
  }
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

  const source = await fetchOwnedSource(supabase, sourceId, agencyId)
  if (!source) return { ok: false, error: 'Not found' }

  // Deleting this row is not "remove a source" — it is "turn web research off permanently". The
  // sources page only renders the Web research section `if (tavilySource)`, so the row's own
  // toggle disappears with it and nothing in the UI can bring it back.
  if (source.type === 'tavily') {
    return { ok: false, error: 'Web research cannot be removed — switch it off instead' }
  }

  if (source.type === 'file' && source.file_path) {
    const admin = createAdminSupabaseClient()
    await admin.storage.from(CLIENT_FILES_BUCKET).remove([source.file_path])
  }

  const { error } = await supabase.from('client_sources').delete().eq('id', sourceId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}

/**
 * Turn web research on or off for a client, and set its site filters. The ONE writer of the
 * tavily row's `is_active` and `config`.
 *
 * There were two. This one filters `config` down to the two keys the search actually reads;
 * `updateSource` — which the sources page reaches the same row through, because it renders the
 * tavily row with the generic `SourceRow` — wrote whatever object it was handed, verbatim. Two
 * shapes for one column, decided by which screen you were on. `updateSource` now refuses the
 * fields this owns.
 *
 * It can also recreate the row. Absence is supposed to be impossible (migration 20260814,
 * `provisionClient`), but `shouldSearchWeb` is `!!tavilyRow`, so a client that somehow lost it has
 * web research off with no way back — this is the way back.
 */
export async function setWebResearch(
  clientId: string,
  input: { is_active: boolean; config?: TavilyConfig }
): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  // Only the keys the web search reads. An unfiltered config is how the two writers diverged.
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
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('client_sources')
      .update({ is_active: input.is_active, config: asJson(config) })
      .eq('id', (existing as { id: string }).id)

    if (error) return { ok: false, error: error.message }

    revalidateTag('agency-clients', 'max')
    return { ok: true, data: { id: (existing as { id: string }).id } }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('client_sources')
    .insert(webResearchSourceRow(clientId, { isActive: input.is_active, config: asJson(config) }))
    .select(CLIENT_SOURCE_COLUMNS)
    .single()

  if (insertError) return { ok: false, error: insertError.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: { id: (inserted as unknown as ClientSource).id } }
}
