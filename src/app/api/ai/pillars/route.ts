import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generatePillars } from '@/ai/generate-pillars/generate-pillars'

interface PillarsRequestBody {
  niche: string
  target_audience: string
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: PillarsRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.niche) return NextResponse.json({ error: 'niche is required' }, { status: 400 })

  try {
    const result = await generatePillars({
      niche: body.niche,
      targetAudience: body.target_audience,
    })
    return NextResponse.json({ pillars: result.pillars ?? [] })
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }
}
