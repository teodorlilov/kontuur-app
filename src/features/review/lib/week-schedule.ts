import { getWeekRange } from '@/utils/date-helpers'
import { DAYS_PER_WEEK, MS_PER_DAY } from '@/utils/constants'
import type { PostStatus } from '@/lib/validation'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface WeekScheduledPost {
  client_id: string
  scheduled_at: string
}

/**
 * Every slot the given clients hold from the week's start through the end of
 * NEXT week — the slot picker needs both weeks to roll a full one over.
 * Throws on query failure; the caller decides whether week context is worth
 * failing a page for.
 */
export async function fetchWeekSchedule(
  supabase: SupabaseClient,
  clientIds: string[],
  weekStartISO: string
): Promise<WeekScheduledPost[]> {
  if (clientIds.length === 0) return []
  const { from, to } = getWeekRange(weekStartISO)
  // Second week appended arithmetically; a DST hour at the boundary cannot
  // matter for day-granular occupancy.
  const toEnd = new Date(new Date(to).getTime() + DAYS_PER_WEEK * MS_PER_DAY).toISOString()

  const { data, error } = await supabase
    .from('posts')
    .select('client_id, scheduled_at')
    .in('client_id', clientIds)
    .in('status', ['scheduled', 'publishing', 'published'] satisfies readonly PostStatus[])
    .gte('scheduled_at', from)
    .lt('scheduled_at', toEnd)
  if (error) throw new Error(`week schedule query failed: ${error.message}`)
  return (data ?? []) as WeekScheduledPost[]
}
