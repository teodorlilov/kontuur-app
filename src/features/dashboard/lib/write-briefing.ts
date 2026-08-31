import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { DASHBOARD_BRIEFING_TAG } from '@/features/dashboard/queries/briefing'
import { getAgencyNiche } from '@/lib/clients/fetch-client-data'
import { asJson } from '@/lib/queries/as-json'
import { getMondayISO } from '@/utils/date-helpers'

/**
 * Write this week's intelligence briefing — the one writer of `intelligence_briefings`.
 *
 * There were three, and they were not equal. The dashboard action handled the lookup error, handled
 * the write error, and revalidated the cache the briefing is read through. The Monday cron did the
 * same insert but never revalidated, so a freshly generated briefing sat behind the previous one
 * for five minutes. A third — a POST route with no caller anywhere in the app — ignored the lookup
 * error, ignored both write errors, and never revalidated either; it has been deleted.
 *
 * `coaching_points` is deliberately not written here. It is a separate column filled only for
 * solo-mode agencies, from a second model call the cron makes after this returns, and folding it in
 * would make every caller pay for a generation most of them do not want.
 */

export interface BriefingWrite {
  id: string
  /** False when a briefing already existed and `refresh` was not asked for. */
  written: boolean
}

export async function writeWeeklyBriefing(
  supabase: SupabaseClient,
  agencyId: string,
  options: { refresh?: boolean } = {}
): Promise<BriefingWrite | null> {
  const weekStart = getMondayISO()

  const { data: existing, error: lookupError } = await supabase
    .from('intelligence_briefings')
    .select('id')
    .eq('agency_id', agencyId)
    .gte('week_start', weekStart)
    .maybeSingle()

  // Not recoverable by falling through to the insert: a failed lookup cannot tell "no briefing this
  // week" from "could not ask", and guessing writes a duplicate.
  if (lookupError) {
    console.error(`[briefing] lookup failed for agency ${agencyId}:`, lookupError.message)
    return null
  }

  const row = existing as { id: string } | null
  // The cron fills a gap; the dashboard button regenerates on demand. Same write, different answer
  // to "and if there is already one".
  if (row && !options.refresh) return { id: row.id, written: false }

  const agencyNiche = await getAgencyNiche(supabase, agencyId)
  const briefing = await generateBriefing({ agencyNiche })

  // niche_trends is an array of objects; `Json` is the generated column type and does not narrow to
  // it, so the shape is asserted rather than inferred.
  const fields = {
    platform_updates: briefing.platform_updates,
    trending_topics: asJson(briefing.niche_trends),
    weekly_tip: briefing.weekly_tip,
    action_nudge: briefing.action_nudge,
    sources: briefing.sources,
  }

  const { data: saved, error: writeError } = row
    ? await supabase
        .from('intelligence_briefings')
        .update(fields)
        .eq('id', row.id)
        .select('id')
        .single()
    : await supabase
        .from('intelligence_briefings')
        .insert({ ...fields, agency_id: agencyId, week_start: weekStart })
        .select('id')
        .single()

  if (writeError || !saved) {
    console.error(`[briefing] write failed for agency ${agencyId}:`, writeError?.message)
    return null
  }

  // The tag, not revalidatePath: the briefing is read through unstable_cache, which a path
  // revalidation does not clear. The cron never did this, which is why its briefings were invisible
  // for five minutes after it wrote them.
  revalidateTag(DASHBOARD_BRIEFING_TAG, 'max')
  return { id: (saved as { id: string }).id, written: true }
}
