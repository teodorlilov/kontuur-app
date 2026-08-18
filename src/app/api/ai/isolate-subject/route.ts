import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { downloadFalFile, removeImageBackground } from '@/lib/visual/fal'
import {
  foreignStoragePathResponse,
  resolveAssetDestination,
} from '@/features/publishing/lib/asset-destination'
import { publicPostImageUrl } from '@/features/publishing/lib/storage'

export const maxDuration = 60

interface IsolateBody {
  clientId?: string
  draftId?: string
  postId?: string
  storagePath?: string
}

/** Cut the main subject out of a slide's clean background into a transparent-PNG element asset. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

  let body: IsolateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body.storagePath !== 'string' || !body.storagePath) {
    return NextResponse.json({ error: 'storagePath is required' }, { status: 400 })
  }

  const destination = await resolveAssetDestination(auth.supabase, auth.agencyId, body)
  if (!destination.ok)
    return NextResponse.json({ error: destination.error }, { status: destination.status })
  const foreignPath = foreignStoragePathResponse(destination.clientId, body.storagePath)
  if (foreignPath) return foreignPath

  try {
    const cutoutUrl = await removeImageBackground(publicPostImageUrl(body.storagePath))
    const buffer = await downloadFalFile(cutoutUrl)
    const { publicUrl, storagePath } = await destination.upload(buffer, 'image/png', 'cutout.png')
    return NextResponse.json({ publicUrl, storagePath })
  } catch (err) {
    console.error('[isolate-subject] failed:', err)
    const message = err instanceof Error ? err.message : 'Subject isolation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
