import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { CANVA_OAUTH_BASE, CANVA_SCOPES } from '../canva-constants'
import crypto from 'crypto'

/**
 * GET /api/canva/connect
 * Initiates Canva OAuth2 authorization code flow with PKCE.
 * Connection is per-user (manager), not per-client.
 */
export async function GET(_request: NextRequest) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const canvaClientId = process.env.CANVA_CLIENT_ID
  const redirectUri = process.env.CANVA_REDIRECT_URI
  if (!canvaClientId || !redirectUri) {
    return NextResponse.json({ error: 'Canva app not configured' }, { status: 500 })
  }

  // PKCE: generate code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  // Encode userId + codeVerifier in state so callback can retrieve both
  const state = Buffer.from(
    JSON.stringify({ userId: auth.userId, codeVerifier })
  ).toString('base64url')

  const oauthUrl = new URL(CANVA_OAUTH_BASE)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('client_id', canvaClientId)
  oauthUrl.searchParams.set('redirect_uri', redirectUri)
  oauthUrl.searchParams.set('scope', CANVA_SCOPES)
  oauthUrl.searchParams.set('state', state)
  oauthUrl.searchParams.set('code_challenge', codeChallenge)
  oauthUrl.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.redirect(oauthUrl.toString())
}
