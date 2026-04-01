import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateProfile } from '@/ai/onboard/generate-profile'
import type { UrlAnalysisResponse } from '@/types/api'

interface OnboardRequestBody {
  answers: {
    q1: string
    q2: string
    q3: string
    q4?: string
    q4b?: string
    q5?: string
    q6?: string
    q7?: string
  }
  analysisData?: UrlAnalysisResponse
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: OnboardRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { answers, analysisData } = body
  if (!answers?.q1 || !answers?.q2 || !answers?.q3) {
    return NextResponse.json({ error: 'Missing required answers' }, { status: 400 })
  }

  try {
    const profile = await generateProfile({ answers, analysisData })
    return NextResponse.json({ profile })
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }
}
