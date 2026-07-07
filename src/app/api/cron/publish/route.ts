import { NextResponse } from 'next/server'
import { publishDuePosts } from '@/features/publishing/lib/scheduler'
import { refreshExpiringTokens } from '@/features/publishing/lib/refresh-tokens'

export const maxDuration = 300

/**
 * Cron endpoint — refreshes expiring Instagram tokens, then publishes all
 * scheduled posts that are due. Refresh runs here (not as its own cron)
 * because the Vercel Hobby plan allows only two cron jobs per project.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Token refresh is best-effort — a failure must not block publishing
  let refresh = null
  try {
    refresh = await refreshExpiringTokens()
  } catch (err) {
    console.error('Token refresh error:', err)
  }

  try {
    const result = await publishDuePosts()
    return NextResponse.json({ ...result, refresh })
  } catch (err) {
    console.error('Publish cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
