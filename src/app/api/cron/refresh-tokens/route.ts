import { NextResponse } from 'next/server'
import { refreshExpiringTokens } from '@/features/publishing/lib/refresh-tokens'

// 300, not 60: the refresh loop is serial (one Meta call per expiring
// connection) and this route now solely owns it.
export const maxDuration = 300

/**
 * Daily token-refresh cron (vercel.json). IG tokens live ~60 days and are
 * refreshed 14 days out, so daily is ample — this used to piggyback on the
 * publish cron, which now fires every five minutes and must stay lean.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await refreshExpiringTokens()
    return NextResponse.json(result)
  } catch (err) {
    console.error('Token refresh cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
