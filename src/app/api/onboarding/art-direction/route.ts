import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { composeArtDirection, type ArtDirectionInput } from '@/lib/brand-kit/compose-art-direction'

// One Claude call; give it modest headroom (no fal here).
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Onboarding "compose art direction": fuse the extracted visual identity + the interview business answers
 * (+ references) into the brand's art-direction spec (operator session only, before the client row exists).
 * Auto-fired at the review step and re-runnable ("Recompose"); the spec is persisted to the new client's
 * kit on save. Fail-soft in the composer → always returns a usable direction.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: Partial<ArtDirectionInput>
  try {
    body = (await request.json()) as Partial<ArtDirectionInput>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const input: ArtDirectionInput = {
    mood: body.mood ?? '',
    motifs: strArr(body.motifs),
    photographicSubjects: strArr(body.photographicSubjects),
    palette: strArr(body.palette),
    fontCategory: body.fontCategory ?? '',
    niche: body.niche ?? '',
    audience: body.audience ?? '',
    goal: body.goal ?? '',
    tone: body.tone ?? '',
    formalityNote: body.formalityNote ?? '',
    pillars: strArr(body.pillars),
    references: body.references ?? '',
  }

  const artDirection = await composeArtDirection(input)
  return NextResponse.json({ artDirection })
}
