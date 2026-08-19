import { type NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { syncAllClientMetrics } from '@/features/analytics/lib/sync-metrics'
import { IG_METRICS_TAG } from '@/features/analytics/lib/report-data'

export const maxDuration = 300

// Stop starting new clients past this point so in-flight work finishes cleanly
// instead of Vercel killing the function at maxDuration (300s) mid-client.
const TIME_BUDGET_MS = 240_000

/** Cron endpoint — nightly Instagram metrics capture for every connected client. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const admin = createAdminSupabaseClient()
  try {
    const result = await syncAllClientMetrics(admin, { timeBudgetMs: TIME_BUDGET_MS })
    if (result.synced > 0) {
      // Fresh rows exist — the analytics document and its narrative re-read them.
      revalidateTag(IG_METRICS_TAG, 'max')
    }
    const elapsedS = Math.round((Date.now() - startedAt) / 1000)
    if (result.errors.length > 0) {
      console.error('[cron:metrics] per-client errors:', result.errors)
    }
    console.info(
      `[cron:metrics] run complete: ${result.synced} synced, ${result.skipped} skipped, ` +
        `${result.failed} failed — ${elapsedS}s of ${maxDuration}s budget`
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron:metrics] run failed:', err)
    return NextResponse.json({ error: 'Metrics sync failed' }, { status: 500 })
  }
}
