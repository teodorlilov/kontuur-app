import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { resolveAssetDestination } from '@/features/assets/lib/asset-destination'
import { fetchRemoteImage } from '@/features/assets/lib/fetch-remote-image'
import { pasteFromUrlSchema } from '@/features/canvas-editor/schemas'

export const maxDuration = 30

/** Re-host an image pasted/dropped from an external URL into the target's storage; returns its ref. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

  const parsed = pasteFromUrlSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  const body = parsed.data

  const destination = await resolveAssetDestination(auth.supabase, auth.agencyId, body)
  if (!destination.ok)
    return NextResponse.json({ error: destination.error }, { status: destination.status })

  try {
    const { buffer, contentType } = await fetchRemoteImage(body.url)
    const { publicUrl, storagePath } = await destination.upload(buffer, contentType, 'pasted-image')
    return NextResponse.json({ publicUrl, storagePath })
  } catch (err) {
    console.error('[paste-from-url] fetch/upload failed:', err)
    const message = err instanceof Error ? err.message : 'Paste failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
