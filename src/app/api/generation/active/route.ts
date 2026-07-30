import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchActiveRuns } from '@/lib/generation/runs'

/** Generation batches composing right now — polled by the shell while a run is live. */
export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  try {
    const runs = await fetchActiveRuns(auth.supabase, auth.agencyId)
    return NextResponse.json({ runs })
  } catch (err) {
    console.error('[generation/active] Failed to fetch active runs:', err)
    return NextResponse.json({ error: 'Failed to fetch active runs' }, { status: 500 })
  }
}
