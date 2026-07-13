import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateDesignSystemPlates } from '@/lib/images/design-system'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { BrandTokens } from '@/lib/scene-graph'

// Generates a few fal plates in-request; give it headroom (matches the other imagery routes).
export const runtime = 'nodejs'
export const maxDuration = 300

type Body = { tokens?: BrandTokens; feedSystemSlug?: string | null; brief?: BrandBrief | null }

/**
 * Onboarding "Generate design system": generate brand-level background plates for the chosen feed system
 * from the brief, before any client/post exists (operator session only). Returns the plates by role for
 * the review preview; they're persisted to the new client's bank on save. Fail-soft — an empty result
 * just means the preview keeps its gradients.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const colors = body.tokens?.color
  if (!colors) return NextResponse.json({ error: 'tokens.color is required' }, { status: 400 })

  const plates = await generateDesignSystemPlates({
    colors,
    brief: body.brief ?? null,
    feedSystemSlug: body.feedSystemSlug ?? null,
  })
  return NextResponse.json({ plates })
}
