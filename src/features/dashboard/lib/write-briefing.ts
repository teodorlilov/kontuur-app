import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { DASHBOARD_BRIEFING_TAG } from '@/features/dashboard/queries/briefing'
import { asJson } from '@/lib/queries/as-json'
import { getMondayISO, shiftDateKey } from '@/utils/date-helpers'

/** What a call did: filled this week's gap, or found it already filled. */
type BriefingWrite = { written: false } | { written: true; itemCount: number; unverified: number }

/**
 * Write this week's brief — the one writer of `intelligence_briefings`.
 *
 * One brief for everyone: platform news is the same for every agency, so the row is keyed on
 * `week_start` alone (UTC Monday) and there is no agency column to scope by. The caller is the
 * hourly generate cron; 167 ticks a week this is one indexed lookup, and on the first tick of a
 * new week it is one web-searched model call covering the seven days just ended.
 *
 * The upsert with `ignoreDuplicates` is the atomic claim: `week_start` is unique, so two ticks that
 * both generated (a concurrent invocation of the same cron minute) cannot both write — the loser's
 * row is simply dropped, and the reader is unaffected either way.
 *
 * Errors propagate. The cron is the boundary and logs once; a swallowed failure here used to read
 * as "no news this week" on every dashboard.
 *
 * The tag, not revalidatePath: the brief is read through unstable_cache, which a path
 * revalidation does not clear.
 */
export async function writeWeeklyBriefing(supabase: SupabaseClient): Promise<BriefingWrite> {
  const weekStart = getMondayISO(new Date(), 'UTC')

  const { data: existing, error: lookupError } = await supabase
    .from('intelligence_briefings')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle()
  if (lookupError) throw new Error(`briefing lookup failed: ${lookupError.message}`)
  if (existing) return { written: false }

  const { items, unverified } = await generateBriefing({
    since: shiftDateKey(weekStart, -7),
    until: weekStart,
  })

  const { error: writeError } = await supabase
    .from('intelligence_briefings')
    .upsert(
      { week_start: weekStart, items: asJson(items) },
      { onConflict: 'week_start', ignoreDuplicates: true }
    )
  if (writeError) throw new Error(`briefing write failed: ${writeError.message}`)

  revalidateTag(DASHBOARD_BRIEFING_TAG, 'max')
  return { written: true, itemCount: items.length, unverified }
}
