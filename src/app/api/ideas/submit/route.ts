import { NextResponse } from 'next/server'
import { fetchTokenByValue, submitIdeas } from '@/features/ideas/lib/ideas'
import { submitIdeasSchema, type SubmitIdeasInput } from '@/features/ideas/schemas'

/** Public endpoint — no auth required. Clients submit ideas via their unique link. */
export async function POST(req: Request) {
  let body: SubmitIdeasInput
  try {
    body = submitIdeasSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'At least one idea brief is required' }, { status: 400 })
  }

  try {
    const tokenRow = await fetchTokenByValue(body.token)
    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    }

    await submitIdeas(tokenRow.id, tokenRow.agency_id, tokenRow.client_id, body.ideas)

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Public route: log the reason here, since the caller only ever sees the generic message.
    console.error('[ideas] submission failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
