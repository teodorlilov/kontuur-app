import type { ClientIdea, IdeaStatus } from '@/types/api'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { CLIENT_IDEA_COLUMNS } from '@/lib/queries/select-columns'

// ── Token helpers (admin client — public routes, no auth) ────

/** Returns existing token or creates a new one for the client. */
export async function getOrCreateToken(agencyId: string, clientId: string): Promise<string> {
  const supabase = createAdminSupabaseClient()

  const { data: existing } = await supabase
    .from('idea_form_tokens')
    .select('token')
    .eq('client_id', clientId)
    .single()

  if (existing) return existing.token

  const random = Math.random().toString(36).slice(2, 8)
  const token = `${clientId.slice(0, 8)}-${random}`

  const { error } = await supabase.from('idea_form_tokens').insert({
    agency_id: agencyId,
    client_id: clientId,
    token,
  })

  if (error) throw new Error(`Failed to create idea token: ${error.message}`)

  return token
}

/** Looks up a token row by its public token string. */
export async function fetchTokenByValue(token: string) {
  const supabase = createAdminSupabaseClient()

  const { data } = await supabase
    .from('idea_form_tokens')
    .select('id, agency_id, client_id, token')
    .eq('token', token)
    .single()

  return data
}

/** Fetches client + agency display info for the public form header. */
export async function fetchFormContext(token: string) {
  const supabase = createAdminSupabaseClient()

  const { data } = await supabase
    .from('idea_form_tokens')
    .select('id, client_id, agency_id')
    .eq('token', token)
    .single()

  if (!data) return null

  const [{ data: client }, { data: agency }] = await Promise.all([
    supabase.from('clients').select('name, niche').eq('id', data.client_id).single(),
    supabase.from('agencies').select('name').eq('id', data.agency_id).single(),
  ])

  return {
    tokenId: data.id,
    clientId: data.client_id,
    clientName: client?.name ?? 'Client',
    agencyId: data.agency_id,
    agencyName: agency?.name ?? 'Agency',
  }
}

// ── Submission (admin client — public route) ─────────────────

interface IdeaInput {
  ideaText: string
  extraNotes?: string
  platform?: string
  targetDate?: string
}

/** Inserts one or more ideas submitted by a client. */
export async function submitIdeas(
  tokenId: string,
  agencyId: string,
  clientId: string,
  ideas: IdeaInput[]
): Promise<void> {
  const supabase = createAdminSupabaseClient()

  const { error } = await supabase.from('client_ideas').insert(
    ideas.map((i) => ({
      agency_id: agencyId,
      client_id: clientId,
      token_id: tokenId,
      idea_text: i.ideaText,
      extra_notes: i.extraNotes || null,
      platform: i.platform || null,
      target_date: i.targetDate || null,
    }))
  )

  if (error) throw new Error(`Failed to submit ideas: ${error.message}`)
}

// ── Dashboard queries (admin client — RLS is service-role only) ──

/** Fetches ideas for the agency with optional filters. */
export async function fetchIdeasForAgency(
  agencyId: string,
  filters?: { clientId?: string; status?: string; limit?: number }
): Promise<ClientIdea[]> {
  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('client_ideas')
    .select(`${CLIENT_IDEA_COLUMNS}, clients(name, niche)`)
    .eq('agency_id', agencyId)
    .order('submitted_at', { ascending: false })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)

  if (filters?.status === 'new') query = query.eq('status', 'new')
  else if (filters?.status === 'generated') query = query.eq('status', 'generated')
  else if (filters?.status === 'dismissed') query = query.eq('status', 'dismissed')

  if (filters?.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch ideas: ${error.message}`)

  return (data ?? []).map(mapIdeaRow)
}

/** Updates the status and/or generated post link of a single idea. */
export async function updateIdeaStatus(
  ideaId: string,
  agencyId: string,
  status?: IdeaStatus,
  generatedPostId?: string
): Promise<void> {
  const updates: Record<string, string> = {}
  if (status) updates.status = status
  if (generatedPostId) updates.generated_post_id = generatedPostId
  if (Object.keys(updates).length === 0) return

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('client_ideas')
    .update(updates)
    .eq('id', ideaId)
    .eq('agency_id', agencyId)

  if (error) throw new Error(`Failed to update idea: ${error.message}`)
}

/** Marks ideas as read by setting read_at on unread rows. */
export async function markIdeasRead(
  agencyId: string,
  ideaIds: string[]
): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('client_ideas')
    .update({ read_at: new Date().toISOString() })
    .in('id', ideaIds)
    .eq('agency_id', agencyId)
    .is('read_at', null)

  if (error) throw new Error(`Failed to mark ideas read: ${error.message}`)
}

/** Counts unread new ideas for the sidebar badge. */
export async function countNewIdeas(agencyId: string): Promise<number> {
  const supabase = createAdminSupabaseClient()
  const { count, error } = await supabase
    .from('client_ideas')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .eq('status', 'new')

  if (error) throw new Error(`Failed to count new ideas: ${error.message}`)
  return count ?? 0
}

/** Fetches a single idea by ID (for generate wizard pre-fill). */
export async function fetchIdeaById(
  ideaId: string,
  agencyId: string
): Promise<ClientIdea | null> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('client_ideas')
    .select(`${CLIENT_IDEA_COLUMNS}, clients(name, niche)`)
    .eq('id', ideaId)
    .eq('agency_id', agencyId)
    .single()

  if (error || !data) return null
  return mapIdeaRow(data)
}

// ── Row mapper ──────────────────────────────────────────────

// Supabase returns untyped rows from joined queries — assertions match the select + join shape
function mapIdeaRow(row: Record<string, unknown>): ClientIdea {
  const clients = row.clients as { name: string; niche: string | null } | null
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: clients?.name ?? 'Client',
    clientNiche: clients?.niche ?? null,
    ideaText: row.idea_text as string,
    extraNotes: (row.extra_notes as string | null) ?? null,
    platform: (row.platform as string | null) ?? null,
    targetDate: (row.target_date as string | null) ?? null,
    status: row.status as IdeaStatus,
    generatedPostId: (row.generated_post_id as string | null) ?? null,
    submittedAt: row.submitted_at as string,
    readAt: (row.read_at as string | null) ?? null,
  }
}
