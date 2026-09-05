import { type NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { syncAllClientComments } from '@/features/comments/lib/sync-comments'
import { PLATFORM_COMMENTS_TAG } from '@/features/comments/queries/comment-queue'

export const maxDuration = 300

// Stop starting new clients past this point so in-flight work finishes cleanly
// instead of Vercel killing the function at maxDuration (300s) mid-client.
const TIME_BUDGET_MS = 240_000

/**
 * Cron endpoint — Instagram comment capture for every connected client.
 *
 * Runs every 30 minutes, which it can afford because the sync only fetches posts
 * whose comment count disagrees with what is already stored. A quiet half hour
 * costs one Graph call per client.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const admin = createAdminSupabaseClient()
  try {
    const result = await syncAllClientComments(admin, { timeBudgetMs: TIME_BUDGET_MS })
    // Only when something actually moved. The common case is a run that fetched
    // nothing, and busting the tag then would throw away a warm queue for no reason.
    if (result.fetched > 0) revalidateTag(PLATFORM_COMMENTS_TAG, 'max')
    const elapsedS = Math.round((Date.now() - startedAt) / 1000)
    if (result.errors.length > 0) {
      console.error('[cron:comments] per-client errors:', result.errors)
    }
    console.info(
      `[cron:comments] run complete: ${result.synced} synced, ${result.skipped} skipped, ` +
        `${result.failed} failed — ${result.fetched} posts fetched, ${result.unchanged} unchanged ` +
        `— ${elapsedS}s of ${maxDuration}s budget`
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron:comments] run failed:', err)
    return NextResponse.json({ error: 'Comments sync failed' }, { status: 500 })
  }
}
