import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { IG_GRAPH_BASE, IG_OAUTH_TOKEN_URL, IG_TOKEN_EXCHANGE_URL } from '@/lib/meta/constants'
import {
  igShortLivedTokenSchema,
  igShortLivedWrappedSchema,
  igLongLivedTokenSchema,
  igUserSchema,
  type IGShortLivedToken,
  type IGLongLivedToken,
} from '@/lib/meta/schemas'
import { decodeOAuthState } from '../oauth-state'

// ---- Instagram Business Login token exchange ----

async function exchangeInstagramCode(
  code: string,
  redirectUri: string
): Promise<IGShortLivedToken> {
  const body = new URLSearchParams()
  body.set('client_id', process.env.META_INSTAGRAM_APP_ID!)
  body.set('client_secret', process.env.META_INSTAGRAM_APP_SECRET!)
  body.set('grant_type', 'authorization_code')
  body.set('redirect_uri', redirectUri)
  body.set('code', code)

  const res = await fetch(IG_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Instagram token exchange failed: ${err}`)
  }

  // Business Login wraps the token in a data array ({"data":[{access_token,...}]});
  // the legacy flat shape ({access_token,...}) still appears on some responses —
  // the schema accepts both, and we fail loudly with the raw body so shape drift
  // stays debuggable.
  const raw: unknown = await res.json()
  const wrapped = igShortLivedWrappedSchema.safeParse(raw)
  if (wrapped.success) {
    const token = wrapped.data.data[0]!
    return { access_token: token.access_token, user_id: token.user_id }
  }

  const flat = igShortLivedTokenSchema.safeParse(raw)
  if (!flat.success) {
    throw new Error(
      `Instagram token exchange returned no access_token: ${JSON.stringify(raw).slice(0, 300)}`
    )
  }
  return { access_token: flat.data.access_token, user_id: flat.data.user_id }
}

async function exchangeInstagramForLongLived(shortLivedToken: string): Promise<IGLongLivedToken> {
  // Guard: an empty token turns this GET into an unroutable request and Graph
  // answers with the misleading "Unsupported request - method type: get"
  if (!shortLivedToken) {
    throw new Error('Instagram long-lived exchange called without a short-lived token')
  }

  const params = new URLSearchParams()
  params.set('grant_type', 'ig_exchange_token')
  params.set('client_secret', process.env.META_INSTAGRAM_APP_SECRET!)
  params.set('access_token', shortLivedToken)

  // Documented form: unversioned GET only. Note: this call is refused with
  // "Unsupported request" for tokens minted off grants the app is not yet
  // entitled to serve (e.g. other businesses' accounts before Meta Access
  // Verification) — that is an entitlement problem, not a request-shape one.
  const res = await fetch(`${IG_TOKEN_EXCHANGE_URL}?${params.toString()}`)
  if (!res.ok) {
    const err = await res.text()
    // Token length/prefix only — never the token itself
    throw new Error(
      `Instagram long-lived token exchange failed (token len=${shortLivedToken.length}, prefix=${shortLivedToken.slice(0, 4)}): ${err.slice(0, 300)}`
    )
  }
  const result = igLongLivedTokenSchema.safeParse(await res.json())
  if (!result.success) {
    throw new Error('Instagram long-lived token exchange returned no access_token')
  }
  return result.data
}

// ---- Connection saver ----

async function connectInstagram(
  longLivedToken: string,
  igUserId: string,
  expiresIn: number,
  clientId: string,
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<void> {
  // Get IG account details using the Instagram Graph API
  const igRes = await fetch(
    `${IG_GRAPH_BASE}/me?fields=id,username,name&access_token=${longLivedToken}`
  )
  if (!igRes.ok) throw new Error('Failed to fetch Instagram account details')
  const igUser = igUserSchema.parse(await igRes.json())

  const expiresAt = new Date()
  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn)

  const { error } = await admin.from('social_connections').upsert(
    {
      client_id: clientId,
      platform: 'instagram',
      account_id: igUser.id ?? igUserId,
      account_name: igUser.username ?? igUser.name ?? igUserId,
      access_token: longLivedToken,
      token_expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'client_id,platform' }
  )

  if (error) throw new Error(`Failed to save Instagram connection: ${error.message}`)
}

// ---- Route handler ----

/** Instagram OAuth return leg: exchange the code for a long-lived token and store the connection. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    const reason = searchParams.get('error_reason') ?? errorParam
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients?meta_error=${encodeURIComponent(reason)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients?meta_error=missing_params`
    )
  }

  // State is HMAC-signed by /api/meta/connect — reject anything we didn't issue
  const decoded = decodeOAuthState(state)
  if (!decoded) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients?meta_error=invalid_state`
    )
  }
  const { clientId } = decoded

  // The callback runs in the user's browser session — require login and
  // verify the client belongs to their agency before saving any connection
  const auth = await resolveAuth()
  if (!auth.ok) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients?meta_error=not_authenticated`
    )
  }
  const owned = await verifyClientOwnership(auth.supabase, clientId, auth.agencyId)
  if (!owned) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients?meta_error=not_authorized`
    )
  }

  const redirectUri = process.env.META_REDIRECT_URI!
  const errorRedirect = `${process.env.NEXT_PUBLIC_APP_URL}/clients/${clientId}/edit?meta_error=1`
  const admin = createAdminSupabaseClient()

  try {
    // Instagram Business Login flow — the only platform the connect route issues state for
    const shortLived = await exchangeInstagramCode(code, redirectUri)
    const longLived = await exchangeInstagramForLongLived(shortLived.access_token)
    await connectInstagram(
      longLived.access_token,
      shortLived.user_id,
      longLived.expires_in,
      clientId,
      admin
    )

    // Connecting was the one side of this that never invalidated — disconnect
    // has always called it (connection-actions.ts). Without this the Clients
    // roster shows a just-linked account as "not connected" for up to 60s.
    revalidateTag('agency-clients', 'max')

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients/${clientId}/edit?meta_connected=instagram`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Instagram OAuth callback error:', message)
    return NextResponse.redirect(
      `${errorRedirect}&meta_error_detail=${encodeURIComponent(message)}`
    )
  }
}
