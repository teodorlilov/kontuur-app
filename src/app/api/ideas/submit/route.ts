import { NextResponse } from 'next/server'
import { fetchTokenByValue, submitIdeas } from '@/lib/ideas'

interface IdeaPayload {
  ideaText: string
  extraNotes?: string
  platform?: string
  targetDate?: string
}

/** Public endpoint — no auth required. Clients submit ideas via their unique link. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { token, ideas } = body as { token: unknown; ideas: unknown }

    if (typeof token !== 'string' || !Array.isArray(ideas) || ideas.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const validated = ideas.filter(
      (i: unknown): i is IdeaPayload =>
        typeof i === 'object' && i !== null && typeof (i as IdeaPayload).ideaText === 'string' && (i as IdeaPayload).ideaText.trim().length > 0
    )

    if (validated.length === 0) {
      return NextResponse.json({ error: 'At least one idea brief is required' }, { status: 400 })
    }

    const tokenRow = await fetchTokenByValue(token)
    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    }

    await submitIdeas(tokenRow.id, tokenRow.agency_id, tokenRow.client_id, validated)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
