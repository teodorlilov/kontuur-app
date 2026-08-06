import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchIdeasForAgency, updateIdeaStatus, markIdeasRead, fetchIdeaById } from '@/features/ideas/lib/ideas'
import { updateIdeasSchema, type UpdateIdeasInput } from '@/features/ideas/schemas'

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

  let body: UpdateIdeasInput
  try {
    body = updateIdeasSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: 'Expected either { action: "mark_read", ids } or { ideaId, status | postId }' },
      { status: 400 }
    )
  }

  if ('action' in body) {
    await markIdeasRead(agencyId, body.ids)
    return NextResponse.json({ ok: true })
  }

  await updateIdeaStatus(body.ideaId, agencyId, body.status, body.postId)
  return NextResponse.json({ ok: true })
}
