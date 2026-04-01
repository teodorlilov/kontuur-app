import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { performResearch } from '@/ai/research/pipeline'

interface ResearchRequestBody {
  clientId: string
  niche: string
  language: string
  count?: number
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:research:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: ResearchRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.niche) return NextResponse.json({ error: 'niche is required' }, { status: 400 })

  const topics = await performResearch({
    supabase,
    agencyId,
    clientId: body.clientId,
    niche: body.niche,
    language: body.language || 'English',
    count: body.count ?? 5,
  })

  return NextResponse.json({ topics })
}
