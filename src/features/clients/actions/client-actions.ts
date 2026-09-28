'use server'

import 'server-only'
import { revalidateTag, revalidatePath } from 'next/cache'
import {
  fetchClientWithOwnership,
  resolveActionAuth,
  verifyClientOwnership,
  type SupabaseServerClient,
} from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import { createAdminSupabaseClient, type AdminClient } from '@/lib/supabase/admin'
import { sweepClientStorage } from '@/lib/clients/sweep-client-storage'
import { parsePillars } from '@/lib/clients/content-pillars'
import { removeDeletedPillarIds } from '@/lib/clients/sync-source-pillars'
import { upsertVisualIdentity } from '@/lib/visual/queries'
import {
  createClientSchema,
  formatIssues,
  updateClientSchema,
  type BrandProfileInput,
  type CreateClientInput,
  type ScheduleInput,
  type UpdateClientInput,
} from '@/features/clients/schemas'
import {
  provisionClient,
  takeBackClient,
  unprovisionClient,
} from '@/features/clients/lib/provision-client'
import { countClientsByAgency } from '@/lib/queries/db'
import { getCachedAgency, getCachedEntitlement, revalidateClientData } from '@/lib/queries/cache'
import { requireEntitledAction } from '@/lib/billing/require-entitled'
import { addBrandRefusal, clientRosterRefusal } from '@/lib/billing/copy'
import {
  QuantityChargeError,
  billedSubscriptionId,
  openSubscriptionId,
  syncSubscriptionQuantity,
} from '@/lib/billing/quantity-sync'
import type { Entitlement } from '@/lib/billing/entitlement'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Create a client with its brand profile, posting schedule and visual identity — the one place a
 * client is created, in both modes, and the only door past the brand cap: the tenant role cannot
 * insert into `clients` since migration 20260854. Auth runs before validation, so an
 * unauthenticated caller cannot fill the log with parse issues. After the insert the plan has its
 * say in `settleNewClient`. The roster busts with `{ expire: 0 }`, not `'max'`: the caller goes
 * straight to `/generate?client=<id>`, whose first-run gate would get the cached empty list and
 * send a solo workspace back to setup (`retireConnection`, src/lib/meta/connection-store.ts).
 */
export async function createClient(input: CreateClientInput): Promise<ActionResult<string>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, role } = auth
  const refused = await requireEntitledAction(agencyId, 'create')
  if (refused) return refused

  const parsed = createClientSchema.safeParse(input)
  if (!parsed.success) {
    console.error('[clients:create] invalid input:', formatIssues(parsed.error))
    return { ok: false, error: 'Invalid client data' }
  }
  const data = parsed.data

  const [entitlement, agency] = await Promise.all([
    getCachedEntitlement(agencyId),
    getCachedAgency(agencyId),
  ])
  const brands = entitlement.brandsUnlimited ? 0 : await countClientsByAgency(supabase, agencyId)
  const capped = addBrandRefusal(entitlement, brands, role)
  if (capped) return { ok: false, error: capped }

  const admin = createAdminSupabaseClient()
  const result = await provisionClient(admin, {
    agencyId,
    name: data.name,
    niche: data.niche,
    postsPerWeek: data.posts_per_week,
    language: data.language,
    websiteUrl: data.website_url,
    contactEmail: data.contact_email,
    brandProfile: data.brand_profile,
    postingSchedule: data.posting_schedule,
    identity: data.visual_identity,
    identitySource: data.visual_identity_source,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const refusal = await settleNewClient(admin, entitlement, agency, agencyId, result.clientId, role)
  if (refusal) return { ok: false, error: refusal }

  revalidateTag('agency-clients', { expire: 0 })
  return { ok: true, data: result.clientId }
}

/** Update a client's core fields, brand profile, posting schedule and visual identity. */
export async function updateClient(
  clientId: string,
  input: UpdateClientInput
): Promise<ActionResult> {
  // Auth before validation: parsing first let an unauthenticated caller reach the
  // logging branch below and fill the log with issues from input we never intended
  // to act on.
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const parsed = updateClientSchema.safeParse(input)
  if (!parsed.success) {
    console.error(`[clients:update] invalid input for ${clientId}:`, formatIssues(parsed.error))
    return { ok: false, error: 'Invalid client data' }
  }
  const data = parsed.data

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const clientError = await updateClientFields(supabase, clientId, data)
  if (clientError) return failedUpdate(clientId, 'client fields', clientError)

  const [profileError, scheduleError, identityError] = await Promise.all([
    data.brand_profile ? updateBrandProfile(supabase, clientId, data.brand_profile) : null,
    data.posting_schedule ? updateSchedule(supabase, clientId, data.posting_schedule) : null,
    data.visual_identity
      ? upsertVisualIdentity(clientId, data.visual_identity, 'manual').then((r) => r.error ?? null)
      : null,
  ])
  if (profileError) return failedUpdate(clientId, 'brand profile', profileError)
  if (scheduleError) return failedUpdate(clientId, 'posting schedule', scheduleError)
  if (identityError) return failedUpdate(clientId, 'visual identity', identityError)

  revalidateTag('agency-clients', 'max')
  revalidatePath('/generate')
  return { ok: true, data: undefined }
}

/**
 * Permanently delete a client, its rows (the 20260820 cascade, via `unprovisionClient`) and its
 * stored files; the warn line is the only record it existed. Admins only, and ownership is checked
 * on the user-scoped client before the delete runs on the admin client, which the cascade needs
 * for tables with RLS on and no policies. While a subscription is open (`openSubscriptionId`) the
 * lower count reaches Stripe after the row is gone, uncharged; a failure there is logged, not
 * surfaced (`syncSubscriptionQuantity` says what heals it). Deliberate gap: a post already
 * `publishing` still reaches the account, and its run's follow-up write silently matches no row;
 * guarding that would refuse the delete for up to one cron tick.
 */
export async function deleteClient(clientId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, role } = auth
  const notAllowed = clientRosterRefusal(role)
  if (notAllowed) return { ok: false, error: notAllowed }

  const parsed = parseActionId(clientId, 'clientId')
  if (!parsed.ok) return parsed.result

  const client = await fetchClientWithOwnership(supabase, parsed.id, agencyId)
  if (!client) return { ok: false, error: 'Not found' }

  const admin = createAdminSupabaseClient()
  const error = await unprovisionClient(admin, parsed.id, agencyId)
  if (error) {
    console.error(`[clients:delete] failed for ${parsed.id}:`, error.message)
    if (error.code === '23503') {
      return { ok: false, error: 'Cannot delete: the database is missing migration 20260820.' }
    }
    return { ok: false, error: 'Could not delete the client. Please try again.' }
  }

  const swept = await sweepClientStorage(parsed.id)
  console.warn(
    `[clients:delete] removed "${client.name}" (${parsed.id}) — ` +
      `${swept.images} images, ${swept.files} files`
  )

  const [entitlement, agency] = await Promise.all([
    getCachedEntitlement(agencyId),
    getCachedAgency(agencyId),
  ])
  const subscriptionId = openSubscriptionId(entitlement, agency)
  if (subscriptionId) {
    await syncSubscriptionQuantity(admin, agencyId, subscriptionId, {
      direction: 'decrease',
    }).catch((err: unknown) =>
      console.error(`[clients:delete] quantity decrease failed for ${agencyId}:`, err)
    )
  }

  revalidateClientData()
  revalidatePath('/generate')
  revalidatePath('/clients')
  return { ok: true, data: undefined }
}

// ── Internal helpers ──

/**
 * What the plan says about a client `createClient` just provisioned: null when it stays, or the
 * refusal once it has been taken back. A capped plan re-judges the cap after the insert with the
 * same rule and `role`, so two creates racing past it both give way instead of both keeping one; a
 * re-count that fails keeps the client, since the check before the insert passed. A billed plan
 * charges through `syncSubscriptionQuantity`; only its `QuantityChargeError` undoes the client,
 * then a decrease lowers any uncharged restore that increase made. Any other failure keeps the
 * client, logged, and the under-count heals on the next add, so no SDK message reaches the form.
 */
async function settleNewClient(
  admin: AdminClient,
  entitlement: Entitlement,
  agency: { stripe_subscription_id: string | null; current_period_start: string | null } | null,
  agencyId: string,
  clientId: string,
  role: string
): Promise<string | null> {
  if (!entitlement.brandsUnlimited) {
    const count = await countClientsByAgency(admin, agencyId).catch((err: unknown) => {
      console.error(`[clients:create] cap re-count failed for ${agencyId}; client kept:`, err)
      return null
    })
    const refusal = count === null ? null : addBrandRefusal(entitlement, count - 1, role)
    if (refusal) await takeBackClient(admin, clientId, agencyId)
    return refusal
  }
  const subscriptionId = billedSubscriptionId(entitlement, agency)
  if (!subscriptionId) return null
  try {
    await syncSubscriptionQuantity(admin, agencyId, subscriptionId, {
      direction: 'increase',
      paid: entitlement.brands,
      paidFor: agency?.current_period_start ?? null,
    })
    return null
  } catch (err) {
    console.error(`[clients:create] quantity sync failed for ${agencyId}:`, err)
    if (!(err instanceof QuantityChargeError)) return null
    await takeBackClient(admin, clientId, agencyId)
    await syncSubscriptionQuantity(admin, agencyId, subscriptionId, {
      direction: 'decrease',
    }).catch((decreaseErr: unknown) =>
      console.error(
        `[clients:create] quantity decrease after undo failed for ${agencyId}:`,
        decreaseErr
      )
    )
    return err.message
  }
}

/**
 * Log the database's reason at the boundary and hand the user a plain one.
 * Raw Supabase messages name columns and constraints, which belong in the log
 * rather than in a form error.
 */
function failedUpdate(clientId: string, part: string, reason: string): ActionResult {
  console.error(`[clients:update] ${part} write failed for ${clientId}:`, reason)
  return { ok: false, error: `Could not save the ${part}. Please try again.` }
}

async function updateClientFields(
  supabase: SupabaseServerClient,
  clientId: string,
  data: UpdateClientInput
): Promise<string | null> {
  const updates: Record<string, unknown> = {}
  if (data.name !== undefined) updates.name = data.name
  if (data.niche !== undefined) updates.niche = data.niche
  if (data.posts_per_week !== undefined) updates.posts_per_week = data.posts_per_week
  if (data.language !== undefined) updates.language = data.language
  if (data.website_url !== undefined) updates.website_url = data.website_url
  if (data.contact_email !== undefined) updates.contact_email = data.contact_email

  if (Object.keys(updates).length === 0) return null

  const { error } = await supabase.from('clients').update(updates).eq('id', clientId)
  return error?.message ?? null
}

async function updateBrandProfile(
  supabase: SupabaseServerClient,
  clientId: string,
  bp: BrandProfileInput
): Promise<string | null> {
  const updates: Record<string, unknown> = {}
  if (bp.tone !== undefined) updates.tone = bp.tone
  if (bp.target_audience !== undefined) updates.target_audience = bp.target_audience
  if (bp.social_goals !== undefined) updates.social_goals = bp.social_goals
  if (bp.content_pillars !== undefined) updates.content_pillars = bp.content_pillars
  if (bp.avoid_topics !== undefined) updates.avoid_topics = bp.avoid_topics
  if (bp.default_post_type !== undefined) updates.default_post_type = bp.default_post_type
  if (bp.default_carousel_slides !== undefined)
    updates.default_carousel_slides = bp.default_carousel_slides
  if (bp.weekly_mix_json !== undefined) updates.weekly_mix_json = bp.weekly_mix_json
  if (bp.language_formality !== undefined) updates.language_formality = bp.language_formality
  if (bp.secondary_language !== undefined) updates.secondary_language = bp.secondary_language
  if (bp.is_health_niche !== undefined) updates.is_health_niche = bp.is_health_niche
  if (bp.language_notes !== undefined) updates.language_notes = bp.language_notes

  if (Object.keys(updates).length === 0) return null

  if (bp.content_pillars !== undefined) {
    await syncDeletedPillars(supabase, clientId, bp.content_pillars)
  }

  const { error } = await supabase.from('brand_profiles').update(updates).eq('client_id', clientId)
  return error?.message ?? null
}

async function syncDeletedPillars(
  supabase: SupabaseServerClient,
  clientId: string,
  newPillarsJson: string | null
): Promise<void> {
  // An unread previous pillar set looks like "nothing was deleted", which leaves
  // orphaned pillar ids on posts instead of clearing them.
  const { data: oldProfile, error } = await supabase
    .from('brand_profiles')
    .select('content_pillars')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new Error(`pillar sync read failed: ${error.message}`)

  const oldPillars = parsePillars(
    (oldProfile as { content_pillars: string | null } | null)?.content_pillars ?? null
  )
  const newPillars = parsePillars(newPillarsJson)
  const newIds = new Set(newPillars.map((p) => p.id))
  const deletedIds = oldPillars.map((p) => p.id).filter((pid) => !newIds.has(pid))

  if (deletedIds.length > 0) {
    await removeDeletedPillarIds(supabase, clientId, deletedIds)
  }
}

async function updateSchedule(
  supabase: SupabaseServerClient,
  clientId: string,
  ps: ScheduleInput
): Promise<string | null> {
  const updates: Record<string, unknown> = {}
  if (ps.is_active !== undefined) updates.is_active = ps.is_active
  if (ps.frequency_type !== undefined) updates.frequency_type = ps.frequency_type
  if (ps.frequency_value !== undefined) updates.frequency_value = ps.frequency_value
  if (ps.auto_generate_day !== undefined) updates.auto_generate_day = ps.auto_generate_day
  if (ps.auto_generate_time !== undefined) updates.auto_generate_time = ps.auto_generate_time

  if (Object.keys(updates).length === 0) return null

  const { error } = await supabase
    .from('posting_schedules')
    .update(updates)
    .eq('client_id', clientId)
  return error?.message ?? null
}
