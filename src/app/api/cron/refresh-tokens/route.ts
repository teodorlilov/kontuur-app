import { NextResponse } from 'next/server'
import { refreshExpiringTokens } from '@/features/publishing/lib/refresh-tokens'

export const maxDuration = 60

/**
 * Standalone token-refresh endpoint. Not registered in vercel.json (the Hobby
 * plan caps projects at two cron jobs — refresh runs inside /api/cron/publish
 * instead), but kept for manual triggering or an external scheduler.
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
