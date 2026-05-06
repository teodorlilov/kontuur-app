import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { CANVA_TOKEN_URL, CANVA_API_BASE } from '../canva-constants'

interface CanvaTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number // seconds
  scope: string
}

async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<CanvaTokenResponse> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('code_verifier', codeVerifier)
  body.set('redirect_uri', redirectUri)

  const credentials = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Canva token exchange failed: ${err}`)
  }
  return res.json() as Promise<CanvaTokenResponse>
}

async function fetchCanvaProfile(
  accessToken: string
): Promise<{ displayName: string; userId: string }> {
  const res = await fetch(`${CANVA_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to fetch Canva profile: ${err}`)
  }
  const data = await res.json()
  const displayName =
    data?.profile?.display_name ??
    data?.display_name ??
    data?.name ??
    data?.user?.display_name ??
    'Canva User'
  const userId =
    data?.team_user?.user_id ??
    data?.user?.id ??
    data?.id ??
    'unknown'
  return { displayName, userId }
}

/**
 * GET /api/canva/callback?code=...&state=...
 * Handles Canva OAuth2 callback — exchanges code for tokens and saves connection
 * at the user (manager) level.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?canva_error=${encodeURIComponent(errorParam)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?canva_error=missing_params`
    )
  }

  let userId: string
  let codeVerifier: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      userId: string
      codeVerifier: string
    }
    userId = decoded.userId
    codeVerifier = decoded.codeVerifier
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?canva_error=invalid_state`
    )
  }

  const redirectUri = process.env.CANVA_REDIRECT_URI!
  const errorRedirect = `${process.env.NEXT_PUBLIC_APP_URL}/settings?canva_error=1`

  try {
    const tokens = await exchangeCodeForToken(code, codeVerifier, redirectUri)
    const profile = await fetchCanvaProfile(tokens.access_token)

    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in)

    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('social_connections').upsert(
      {
        user_id: userId,
        platform: 'canva',
        account_id: profile.userId,
        account_name: profile.displayName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'user_id,platform' }
    )

    if (error) throw new Error(`Failed to save Canva connection: ${error.message}`)

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?canva_connected=1`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Canva OAuth callback error:', message)
    return NextResponse.redirect(
      `${errorRedirect}&canva_error_detail=${encodeURIComponent(message)}`
    )
  }
}
