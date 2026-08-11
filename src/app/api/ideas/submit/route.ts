import { NextResponse } from 'next/server'
import {
  fetchTokenByValue,
  hasExceededSubmissionRate,
  submitIdeas,
} from '@/features/ideas/lib/ideas'
import { submitIdeasSchema, submitIdeasErrorMessage } from '@/features/ideas/schemas'

/** Public endpoint — no auth required. Clients submit ideas via their unique link. */
export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'At least one idea brief is required' }, { status: 400 })
  }
  // The form shows this error verbatim, so it has to say what actually failed —
  // a client with eleven filled cards was told "at least one brief is required".
  const parsed = submitIdeasSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: submitIdeasErrorMessage(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  try {
    const tokenRow = await fetchTokenByValue(body.token)
    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    }

    // Scoped to the link, not the caller: the token is the only identity this endpoint
    // has, and it is also what an abuser would have to hold to reach the table at all.
    if (await hasExceededSubmissionRate(tokenRow.id)) {
      return NextResponse.json(
        { error: 'Too many ideas sent from this link. Please try again later.' },
        { status: 429 }
      )
    }

    await submitIdeas(tokenRow.id, tokenRow.agency_id, tokenRow.client_id, body.ideas)

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Public route: log the reason here, since the caller only ever sees the generic message.
    console.error('[ideas] submission failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
