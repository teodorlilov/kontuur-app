import { NextResponse } from 'next/server'
import { refreshExpiringTokens } from '@/features/publishing/lib/refresh-tokens'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'

// 300, not 60: the refresh loop is serial (one Meta call per expiring
// connection) and this route now solely owns it.
export const maxDuration = 300

/**
 * Daily token-refresh cron (vercel.json). IG tokens live ~60 days and are
 * refreshed 14 days out, so daily is ample — this used to piggyback on the
 * publish cron, which now fires every five minutes and must stay lean.
 */
export async function GET(request: Request) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  try {
    const result = await refreshExpiringTokens()
    return NextResponse.json(result)
  } catch (err) {
    console.error('Token refresh cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
