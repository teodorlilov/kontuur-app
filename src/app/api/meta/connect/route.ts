import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { IG_AUTHORIZE_URL } from '@/lib/meta/constants'
import { encodeOAuthState } from '../oauth-state'

/**
 * Instagram Business Login — direct instagram.com OAuth.
 *
 * `manage_comments` is requested even though the app only holds Standard Access for it. That is
 * deliberate and it is the order Meta requires: Advanced Access is granted through App Review, and
 * App Review expects to see successful calls against the permission first. Requesting it does not
 * break the dialog for anyone — Meta drops a permission the app is not approved for rather than
 * erroring — and users who hold a role on the Meta app (admin, developer, tester) DO get it, which
 * is how the flow is exercised before review.
 *
 * A token already issued does not gain the new permission. Existing connections keep the three
 * scopes they were granted until the client reconnects, so comment calls on those will fail the
 * permission check rather than return empty.
 */
const INSTAGRAM_BUSINESS_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
].join(',')

/** Start the Instagram OAuth flow — redirects to instagram.com with a signed state. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const platform = searchParams.get('platform')

  // Instagram is the only platform Kontuur connects — reject anything else outright.
  if (!clientId || platform !== 'instagram') {
    return NextResponse.json(
      { error: 'client_id and platform=instagram are required' },
      { status: 400 }
    )
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId } = auth

  const owned = await verifyClientOwnership(auth.supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const igAppId = process.env.META_INSTAGRAM_APP_ID
  const redirectUri = process.env.META_REDIRECT_URI
  // META_APP_SECRET signs the OAuth state, so it is required even though the
  // Instagram app has its own secret for the token exchange.
  if (!igAppId || !redirectUri || !process.env.META_APP_SECRET) {
    return NextResponse.json({ error: 'Meta app not configured' }, { status: 500 })
  }

  const state = encodeOAuthState({ clientId, platform: 'instagram' })

  // Instagram Business Login — redirects to instagram.com consent page
  const oauthUrl = new URL(IG_AUTHORIZE_URL)
  oauthUrl.searchParams.set('client_id', igAppId)
  oauthUrl.searchParams.set('redirect_uri', redirectUri)
  oauthUrl.searchParams.set('scope', INSTAGRAM_BUSINESS_SCOPES)
  oauthUrl.searchParams.set('state', state)
  oauthUrl.searchParams.set('response_type', 'code')

  return NextResponse.redirect(oauthUrl.toString())
}
