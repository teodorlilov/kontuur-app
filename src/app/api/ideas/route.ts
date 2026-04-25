import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchIdeasForAgency, updateIdeaStatus, markIdeasRead, fetchIdeaById } from '@/lib/ideas'
import type { IdeaStatus } from '@/types/api'

/** GET — list ideas for the authenticated agency. */
export async function GET(req: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId } = auth

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const ideaId = url.searchParams.get('ideaId')
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined

  // Single idea fetch (for generate wizard pre-fill)
  if (ideaId) {
    const idea = await fetchIdeaById(ideaId, agencyId)
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    return NextResponse.json({ idea })
  }

  const ideas = await fetchIdeasForAgency(agencyId, { clientId, status, limit })
  return NextResponse.json({ ideas })
}

/** PATCH — update idea status or mark ideas as read. */
export async function PATCH(req: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId } = auth

  const body = await req.json()

  // Mark ideas as read
  if (body.action === 'mark_read' && Array.isArray(body.ids)) {
    await markIdeasRead(agencyId, body.ids as string[])
    return NextResponse.json({ ok: true })
  }

  // Update idea status and/or link a generated post
  const { ideaId, status, postId } = body as {
    ideaId: string
    status?: IdeaStatus
    postId?: string
  }

  if (!ideaId || (!status && !postId)) {
    return NextResponse.json({ error: 'ideaId and status or postId required' }, { status: 400 })
  }

  await updateIdeaStatus(ideaId, agencyId, status, postId)
  return NextResponse.json({ ok: true })
}
