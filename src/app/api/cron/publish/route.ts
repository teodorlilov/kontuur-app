import { NextResponse } from 'next/server'
import { publishDuePosts } from '@/features/publishing/lib/scheduler'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'

export const maxDuration = 300

/**
 * Cron endpoint — publishes all scheduled posts that are due. Fires every five minutes
 * (vercel.json) so a post lands at its scheduled time. Overlapping ticks are safe because every
 * attempt first takes the row through `claimPublication`'s compare-and-swap
 * (src/features/publishing/lib/publication-store.ts), so only one run wins a destination, and
 * the due query in `publishDuePosts` (src/features/publishing/lib/scheduler.ts) re-offers a
 * 'publishing' row only once its claim is stale. Token refresh lives in /api/cron/refresh-tokens
 * — a slow Meta refresh loop must not sit in front of time-sensitive publishing. An unreconciled
 * publication is logged as an error because its row still reads 'publishing' and the stale-claim
 * reclaim will pick it up (`PublishSchedulerResult.unreconciled` in scheduler.ts).
 */
export async function GET(request: Request) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  try {
    const result = await publishDuePosts()
    for (const publication of result.unreconciled) {
      console.error(
        `[publish] UNRECONCILED publication ${publication.publicationId} is live as ${publication.externalPostId ?? 'unknown'} but its row still reads 'publishing' — fix the row before the claim expires`
      )
    }
    for (const message of result.writeErrors) console.warn(`[publish] ${message}`)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Publish cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
