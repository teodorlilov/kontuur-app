import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Who pays for a generated image. Either form is accepted because the callers genuinely differ:
 * the routes hold the caller's `agencyId`, while the visuals cron iterates posts and only ever
 * knows the client.
 */
export type ImageSpender = { agencyId: string } | { clientId: string }

/**
 * A quota high enough that nothing is ever refused.
 *
 * `consume_image_credits` is a compare-and-set — it only increments while `count + cost <= quota` —
 * so recording spend without enforcing a ceiling means passing one that cannot be reached. The
 * alternative would be a second RPC that only counts, which is a schema change to express
 * "no limit yet".
 */
const NO_CEILING = 2_000_000_000

/** `image_generation_usage.month`, the bucket a spend lands in. UTC, matching the column's writers. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Record that an image was generated, so image spend is attributable per agency per month.
 *
 * The plumbing for this has existed since the baseline — `image_generation_usage`,
 * `consume_image_credits`, `refund_image_credits` — and was called from NOWHERE. The only `.rpc()`
 * in the codebase was a read-only stats function, so every gpt-image-2 request ran against no
 * ceiling and left no trace of what it cost.
 *
 * It counts; it does not refuse. The ceiling is a product decision that has not been made, and
 * inventing one here would start failing generations at a number nobody chose. What this buys is
 * the numbers to choose it from.
 *
 * Never throws. A failure to record must not cost the user an image they are already waiting on —
 * the whole point is that this is bookkeeping, not a gate.
 */
export async function recordImageSpend(spender: ImageSpender, cost = 1): Promise<void> {
  try {
    const admin = createAdminSupabaseClient()

    let agencyId: string | null = 'agencyId' in spender ? spender.agencyId : null
    if (!agencyId) {
      const { data } = await admin
        .from('clients')
        .select('agency_id')
        .eq('id', (spender as { clientId: string }).clientId)
        .maybeSingle()
      agencyId = (data as { agency_id: string } | null)?.agency_id ?? null
    }
    if (!agencyId) return

    const { error } = await admin.rpc('consume_image_credits', {
      p_agency_id: agencyId,
      p_month: currentMonth(),
      p_cost: cost,
      p_quota: NO_CEILING,
    })
    if (error) console.warn('[visual] could not record image spend:', error.message)
  } catch (err) {
    console.warn('[visual] could not record image spend:', err)
  }
}
