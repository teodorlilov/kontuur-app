import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Record the topics a client has already had, so later generation runs do not repeat them.
 *
 * Called from the one moment a post is KEPT (`recordKeptTopics`, lib/actions/post-actions.ts).
 * Writing a draft records nothing: since 2026-09-20 a generated draft is a row as soon as it is
 * written, and recording there meant a draft that was discarded burned its topic for good.
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
