import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateDesignSystemPlates, generateDesignSystemVectors } from '@/lib/images/design-system'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { BrandTokens } from '@/lib/scene-graph'

// Generates a few fal plates in-request; give it headroom (matches the other imagery routes).
export const runtime = 'nodejs'
export const maxDuration = 300

type Body = { tokens?: BrandTokens; feedSystemSlug?: string | null; brief?: BrandBrief | null }

/**
 * Onboarding "Generate design system": generate the brand-level design system before any client/post
 * exists (operator session only) — background plates (by role) plus a starter set of on-brand vector
 * marks from the brief's motifs. Returns both for the review; they're persisted to the new client's banks
 * on save. Fail-soft — an empty result just means the preview keeps its gradients / shows no marks.
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

  const ctx = { colors, brief: body.brief ?? null, feedSystemSlug: body.feedSystemSlug ?? null }
  const [plates, vectors] = await Promise.all([
    generateDesignSystemPlates(ctx),
    generateDesignSystemVectors(ctx),
  ])
  return NextResponse.json({ plates, vectors })
}
