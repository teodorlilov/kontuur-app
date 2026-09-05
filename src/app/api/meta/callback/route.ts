import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { storeConnection } from '@/lib/meta/connection-store'
import {
  exchangeFacebookCode,
  exchangeFacebookForLongLived,
  fetchFacebookUser,
} from '@/lib/meta/facebook-auth'
import { FACEBOOK_USER_PLATFORM } from '@/lib/meta/oauth-networks'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { fetchIgConnectionState } from '@/lib/queries/db'
import { captureAndDeriveBestTime } from '@/features/analytics/lib/online-followers'
import { IG_METRICS_TAG } from '@/features/analytics/lib/report-data'
import { purgeAccountAnalytics } from '@/features/analytics/lib/purge-account-metrics'
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

/** Save the Instagram connection, returning the account id it was stored under. */
async function connectInstagram(
  longLivedToken: string,
  igUserId: string,
  expiresIn: number,
  clientId: string,
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<string> {
  // Get IG account details using the Instagram Graph API
  const igRes = await fetch(
    `${IG_GRAPH_BASE}/me?fields=id,username,name&access_token=${longLivedToken}`
  )
  if (!igRes.ok) throw new Error('Failed to fetch Instagram account details')
  const igUser = igUserSchema.parse(await igRes.json())

  const expiresAt = new Date()
  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn)

  const accountId = igUser.id ?? igUserId

  await storeConnection(admin, {
    clientId,
    platform: 'instagram',
    accountId,
    accountName: igUser.username ?? igUser.name ?? igUserId,
    accessToken: longLivedToken,
    tokenExpiresAt: expiresAt.toISOString(),
  })

  return accountId
}

/**
 * Erase the analytics of an account this client has just been moved off.
 *
 * Every analytics read is `.eq('ig_account_id', …)`, so rows belonging to a
 * superseded account are invisible the moment the switch lands — and until now
 * nothing could delete them either, so they accumulated forever. 20260826 chose
 * to keep them ("a reconnect starts a new history beside the old one"); this
 * reverses that, because unreachable rows are not a history.
 *
 * Never throws. The upsert has already committed by the time this runs, so a
 * failure here must not be reported as a failed connect — the user would see
 * "Failed to connect account" for an account that is connected and working.
 * Logged with both ids because a retry cannot fix it: on the second attempt the
 * previous account IS the new one, so the caller's guard can never fire again
 * and these rows need a human.
 */
async function purgeSupersededAccount(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  clientId: string,
  previousAccountId: string
): Promise<void> {
  try {
    await purgeAccountAnalytics(admin, clientId, previousAccountId)
  } catch (purgeErr) {
    console.error(
      `[meta/callback] analytics purge failed, orphaned rows for client=${clientId} ` +
        `ig_account=${previousAccountId}:`,
      purgeErr
    )
  } finally {
    // On attempt, not on success: a partly-completed purge still changed the
    // data, and a cache serving half-deleted rows is worse than a wasted bust.
    revalidateTag(IG_METRICS_TAG, 'max')
  }
}

// ---- Route handler ----

/** Instagram OAuth return leg: exchange the code for a long-lived token and store the connection. */
/**
 * Facebook's half: consent yields a USER token, not a connected account.
 *
 * Instagram's consent names the account it connects, so one exchange finishes the job. A person
 * may administer several Pages, so this stores the long-lived user token and hands off to the
 * chooser — the Page itself is connected there, by `connectFacebookPage`.
 *
 * The row is user-scoped: `client_id` NULL, `user_id` set, platform `facebook_user`. That is the
 * shape Canva already uses here, and the NULL client_id puts it outside RLS, so it is
 * admin-client only and every read of it keeps its platform filter. It is not a publishing
 * connection and resolves to no adapter, so `resolveDestinations` and the roster's channel chips
 * both ignore it without needing to know it exists.
 */
async function connectFacebookUser(
  code: string,
  redirectUri: string,
  userId: string,
  clientId: string,
  admin: SupabaseClient
): Promise<NextResponse> {
  const shortLived = await exchangeFacebookCode(code, redirectUri)
  const longLived = await exchangeFacebookForLongLived(shortLived)
  const user = await fetchFacebookUser(longLived)

  await storeConnection(admin, {
    clientId: null,
    userId,
    platform: FACEBOOK_USER_PLATFORM,
    accountId: user.id,
    accountName: user.name,
    accessToken: longLived,
    // Facebook does not date a long-lived user token, and `token-expiry.ts` already reads null
    // as "never expires" — a guessed date would start warning about a token that is fine.
    tokenExpiresAt: null,
  })

  // Back to the client whose settings started this, with the chooser open: the flow is only
  // half done until a Page is picked.
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/clients/${clientId}/edit?tab=accounts&choose_page=1`
  )
}

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
    if (decoded.platform === 'facebook') {
      return await connectFacebookUser(code, redirectUri, auth.userId, clientId, admin)
    }

    const shortLived = await exchangeInstagramCode(code, redirectUri)
    const longLived = await exchangeInstagramForLongLived(shortLived.access_token)

    // Read before the upsert: it conflicts on (client_id, platform), so it
    // overwrites account_id in place and the outgoing account is unrecoverable
    // afterwards. Non-fatal by construction — this read exists only to enable an
    // optional cleanup, and fetchIgConnectionState throws on a query error, so
    // bare it would fail a connect that is otherwise perfectly fine.
    const previousAccountId = await fetchIgConnectionState(admin, clientId)
      .then((state) => state.accountId)
      .catch((readErr: unknown) => {
        console.error('[meta/callback] previous-account read failed, skipping purge:', readErr)
        return null
      })

    const accountId = await connectInstagram(
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

    if (previousAccountId && previousAccountId !== accountId) {
      await purgeSupersededAccount(admin, clientId, previousAccountId)
    }

    /**
     * Posting times, now, rather than after three nights of cron.
     *
     * Meta serves this history on request, so an established account can answer "when are your
     * followers online" the moment it is linked. Nothing asked: the nightly sync collected four
     * days at a time and the derivation waited for a threshold, so connecting an account with two
     * years of history produced an empty calendar for the better part of a week.
     *
     * Awaited rather than fired and forgotten — a serverless function stops at its response, so a
     * detached promise here is a coin flip. Never throws: this is one Graph call and a derivation
     * on the tail of a connect that has already committed, and a user seeing "Failed to connect"
     * for an account that is connected and working would be a far worse outcome than waiting a
     * night for their times.
     */
    await captureAndDeriveBestTime(admin, {
      clientId,
      accountId,
      accessToken: longLived.access_token,
    }).catch((bestTimeErr: unknown) => {
      console.error('[meta/callback] initial best-time capture failed:', bestTimeErr)
    })

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
