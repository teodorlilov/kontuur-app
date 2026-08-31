import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Record the topics a client has already had, so later generation runs do not repeat them.
 *
 * Both places a post comes into existence write this — the cron batch and the approve-a-draft
 * route — and they were writing the identical two-column row from two files. That is the shape this
 * whole pass exists to remove: nothing kept them agreeing, and the next column added to the table
 * would have landed in one of them.
 *
 * Never throws. The post is already saved by the time this runs, and history only feeds topic
 * de-duplication, so losing a row costs a repeated topic weeks later — not the batch.
 */
export async function recordPostTopics(
  supabase: SupabaseClient,
  clientId: string,
  topicSummaries: string[]
): Promise<void> {
  const rows = topicSummaries
    .filter((topic) => topic.trim().length > 0)
    .map((topic) => ({ client_id: clientId, topic_summary: topic }))
  if (rows.length === 0) return

  const { error } = await supabase.from('post_history').insert(rows)
  if (error) {
    console.error('[post-history] insert failed:', error.message)
  }
}
