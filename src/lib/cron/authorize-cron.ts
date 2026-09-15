import { NextResponse } from 'next/server'

/**
 * The bearer check every cron route opens with. Vercel calls a cron with
 * `Authorization: Bearer <CRON_SECRET>`; an unset secret refuses everything rather than letting
 * anything through. Returns the 401 to send, or null when the caller may proceed.
 */
export function unauthorizedCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
