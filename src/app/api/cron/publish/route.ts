import { NextResponse } from 'next/server'
import { publishDuePosts } from '@/features/publishing/lib/scheduler'

export const maxDuration = 300

/**
 * Cron endpoint — publishes all scheduled posts that are due. Fires every
 * five minutes so a post lands at its scheduled time, not at the next daily
 * sweep; the scheduler's claim CAS makes overlapping ticks safe. Token
 * refresh lives in /api/cron/refresh-tokens — a slow Meta refresh loop must
 * not sit in front of time-sensitive publishing.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await publishDuePosts()
    // Loud, because the reclaim will republish these once their claim goes stale.
    for (const post of result.unreconciled) {
      console.error(
        `[publish] UNRECONCILED post ${post.postId} is live on Instagram as media ${post.mediaId ?? 'unknown'} but its row still reads 'publishing' — fix the row before the claim expires`
      )
    }
    for (const message of result.writeErrors) console.warn(`[publish] ${message}`)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Publish cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
