import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/** Postgres unique_violation — the primary key rejected a second claim on the same position. */
const UNIQUE_VIOLATION = '23505'

/**
 * How long a claim speaks for its generation.
 *
 * One picture takes ~52s and the route that makes it is capped at 120s, so a claim older than
 * this belongs to an invocation that was killed — it cannot have deleted its own row — and the
 * position is free again. Long enough that no live job is ever overtaken; short enough that a
 * killed one costs a person one wait, not a permanently stuck slide.
 */
const VISUAL_JOB_STALE_MS = 3 * 60_000

const staleBefore = (): string => new Date(Date.now() - VISUAL_JOB_STALE_MS).toISOString()

/**
 * Take a slide position for the picture about to be made — the claim that stops one position
 * being generated twice.
 *
 * Nothing else can tell: a generation leaves no trace until it lands as a `post_images` row, so
 * every reader of "which positions still owe a picture" — a resumed run, a second tab, the
 * visuals cron beside a person pressing Regenerate — asks for the same position again and the
 * workspace pays twice for one surviving picture.
 *
 * False means someone else is making it right now. A claim older than `VISUAL_JOB_STALE_MS` is
 * taken over instead, because the invocation that left it was killed and will never release it.
 * A failure that is not a lost race returns TRUE: this is bookkeeping, and it must never be the
 * reason a person does not get their picture.
 */
export async function claimVisualJob(
  admin: SupabaseClient,
  postId: string,
  position: number
): Promise<boolean> {
  const { error } = await admin.from('post_visual_jobs').insert({ post_id: postId, position })
  if (!error) return true
  if (error.code !== UNIQUE_VIOLATION) {
    console.error(`[visual-jobs] could not claim ${postId}#${position}:`, error.message)
    return true
  }

  const { data } = await admin
    .from('post_visual_jobs')
    .update({ started_at: new Date().toISOString() })
    .eq('post_id', postId)
    .eq('position', position)
    .lt('started_at', staleBefore())
    .select('post_id')
    .maybeSingle()
  return data !== null
}

/** Give the position back, whether the picture arrived or the attempt failed. Best-effort: an
 *  undeleted claim is forgiven by its age, so a failure here costs one wait, never a picture. */
export async function releaseVisualJob(
  admin: SupabaseClient,
  postId: string,
  position: number
): Promise<void> {
  const { error } = await admin
    .from('post_visual_jobs')
    .delete()
    .eq('post_id', postId)
    .eq('position', position)
  if (error) {
    console.error(`[visual-jobs] could not release ${postId}#${position}:`, error.message)
  }
}

/**
 * Delete the claims no invocation is coming back for, returning how many.
 *
 * A claim past the window is already ignored by every reader, so this changes no behaviour — it
 * stops the table keeping one row per killed generation for the life of the post, and it frees the
 * position for a retry rather than making the reviewer wait out the window. Runs on the hourly
 * visuals cron, which is the other thing in this domain; the daily `clearStaleReservations` is the
 * same shape one table over.
 */
export async function clearStaleVisualJobs(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from('post_visual_jobs')
    .delete()
    .lt('started_at', staleBefore())
    .select('post_id')
  if (error) throw new Error(`stale visual job sweep failed: ${error.message}`)
  return data?.length ?? 0
}

/**
 * The positions of these posts whose pictures are being made right now, by post id.
 *
 * Read wherever a surface decides what to ask for or what to show: a position in here is neither
 * missing nor finished, so it is shown as generating and never requested again. Abandoned claims
 * are filtered by age here as well as at the claim, so a killed invocation cannot make a slide
 * look busy forever.
 */
export async function fetchVisualJobs(
  admin: SupabaseClient,
  postIds: string[]
): Promise<Map<string, number[]>> {
  const byPost = new Map<string, number[]>()
  if (postIds.length === 0) return byPost

  const { data, error } = await admin
    .from('post_visual_jobs')
    .select('post_id, position')
    .in('post_id', postIds)
    .gte('started_at', staleBefore())
  // A failed read would show every in-flight position as missing, which is the double generation
  // this table exists to prevent — so it is reported rather than swallowed.
  if (error) throw new Error(`visual job query failed: ${error.message}`)

  for (const row of data ?? []) {
    byPost.set(row.post_id, [...(byPost.get(row.post_id) ?? []), row.position])
  }
  return byPost
}
