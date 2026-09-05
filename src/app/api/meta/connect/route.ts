import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { encodeOAuthState } from '../oauth-state'
import { authorizeUrlFor, isOAuthPlatform, OAUTH_PLATFORMS } from '@/lib/meta/oauth-networks'

/** Start a network's OAuth flow — redirects to its consent page with a signed state. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const platform = searchParams.get('platform')

  // The platforms this app can connect are declared once, in oauth-networks — a gate spelled out
  // here would be a second list to keep in agreement with the one the callback dispatches on.
  if (!clientId || !platform || !isOAuthPlatform(platform)) {
    return NextResponse.json(
      { error: `client_id and a supported platform are required (${OAUTH_PLATFORMS.join(', ')})` },
      { status: 400 }
    )
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const owned = await verifyClientOwnership(auth.supabase, clientId, auth.agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const redirectUri = process.env.META_REDIRECT_URI
  // META_APP_SECRET signs the OAuth state, so it is required whichever network is being
  // connected — even Instagram, whose token exchange uses its own app secret.
  if (!redirectUri || !process.env.META_APP_SECRET) {
    return NextResponse.json({ error: 'Meta app not configured' }, { status: 500 })
  }

  const authorizeUrl = authorizeUrlFor(
    platform,
    redirectUri,
    encodeOAuthState({ clientId, platform })
  )
  if (!authorizeUrl) {
    return NextResponse.json({ error: `${platform} app not configured` }, { status: 500 })
  }

  return NextResponse.redirect(authorizeUrl)
}
