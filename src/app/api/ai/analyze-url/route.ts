import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { analyzeBrand } from '@/lib/sources/analyze-brand'

// A sitemap lookup, up to seven page fetches (8s timeout each, in two parallel waves) and a model
// call. The single-page version this replaced fitted comfortably in the default; this does not.
export const maxDuration = 60

/** Both fields optional here; the "at least one" rule is checked below so the two cases give distinct errors. */
const analyzeUrlSchema = z.object({
  websiteUrl: z.string().optional(),
  instagramHandle: z.string().optional(),
})

/** Fetch a website and/or Instagram profile and return an LLM analysis of the brand. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  // Metered like the other model calls, and for a second reason the rest do not have:
  // this route fetches an arbitrary caller-supplied URL, so unthrottled it is also a way
  // to aim our egress at a third party.
  const limited = aiRateLimitResponse('analyze-url', auth.userId)
  if (limited) return limited

  let body: z.infer<typeof analyzeUrlSchema>
  try {
    body = analyzeUrlSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.websiteUrl?.trim() && !body.instagramHandle?.trim()) {
    return NextResponse.json(
      { error: 'At least one of websiteUrl or instagramHandle is required' },
      { status: 400 }
    )
  }

  try {
    const analysis = await analyzeBrand({
      websiteUrl: body.websiteUrl,
      instagramHandle: body.instagramHandle,
    })
    if (!analysis) {
      return NextResponse.json(
        { error: 'Could not fetch content from the provided URLs' },
        { status: 422 }
      )
    }
    return NextResponse.json(analysis)
  } catch (err) {
    console.error('[analyze-url] analysis failed:', err)
    return NextResponse.json({ error: 'Failed to parse analysis response' }, { status: 500 })
  }
}
