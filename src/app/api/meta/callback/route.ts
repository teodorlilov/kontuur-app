import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { META_GRAPH_VERSION, META_GRAPH_BASE as GRAPH_BASE } from '../meta-constants'

// ---- Instagram Business Login token exchange ----

interface IGShortLivedToken {
  access_token: string
  user_id: string
}

interface IGLongLivedToken {
  access_token: string
  token_type: string
  expires_in: number
}

async function exchangeInstagramCode(code: string, redirectUri: string): Promise<IGShortLivedToken> {
  const body = new URLSearchParams()
  body.set('client_id', process.env.META_INSTAGRAM_APP_ID!)
  body.set('client_secret', process.env.META_INSTAGRAM_APP_SECRET!)
  body.set('grant_type', 'authorization_code')
  body.set('redirect_uri', redirectUri)
  body.set('code', code)

  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Instagram token exchange failed: ${err}`)
  }
  return res.json() as Promise<IGShortLivedToken>
}

async function exchangeInstagramForLongLived(shortLivedToken: string): Promise<IGLongLivedToken> {
  const url = new URL('https://graph.instagram.com/access_token')
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', process.env.META_INSTAGRAM_APP_SECRET!)
  url.searchParams.set('access_token', shortLivedToken)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Instagram long-lived token exchange failed: ${err}`)
  }
  return res.json() as Promise<IGLongLivedToken>
}

// ---- Facebook token exchange ----

interface FBTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

async function exchangeFacebookCode(code: string, redirectUri: string): Promise<FBTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set('client_id', process.env.META_APP_ID!)
  url.searchParams.set('client_secret', process.env.META_APP_SECRET!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('code', code)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Facebook token exchange failed: ${err}`)
  }
  return res.json() as Promise<FBTokenResponse>
}

async function exchangeFacebookForLongLived(shortLivedToken: string): Promise<FBTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', process.env.META_APP_ID!)
  url.searchParams.set('client_secret', process.env.META_APP_SECRET!)
  url.searchParams.set('fb_exchange_token', shortLivedToken)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Facebook long-lived token exchange failed: ${err}`)
  }
  return res.json() as Promise<FBTokenResponse>
}

// ---- Platform connection savers ----

async function connectInstagram(
  longLivedToken: string,
  igUserId: string,
  expiresIn: number,
  clientId: string,
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<void> {
  // Get IG account details using the Instagram Graph API
  const igRes = await fetch(
    `https://graph.instagram.com/${META_GRAPH_VERSION}/me?fields=id,username,name&access_token=${longLivedToken}`
  )
  if (!igRes.ok) throw new Error('Failed to fetch Instagram account details')
  const igUser = await igRes.json() as { id: string; username?: string; name?: string }

  const expiresAt = new Date()
  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn)

  const { error } = await admin
    .from('social_connections')
    .upsert(
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

interface FBPage {
  id: string
  name: string
  access_token: string
}

async function connectFacebook(
  longLivedToken: string,
  clientId: string,
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<void> {
  // Try personal admin pages first
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&limit=100&access_token=${longLivedToken}`
  )
  const pagesBody = await pagesRes.json() as { data?: FBPage[]; error?: { message: string } }
  if (!pagesRes.ok || pagesBody.error) {
    throw new Error(`Failed to fetch Facebook pages: ${pagesBody.error?.message ?? pagesRes.status}`)
  }

  let page: FBPage | undefined = pagesBody.data?.[0]

  // Fallback: try Business Portfolio pages (requires business_management permission)
  if (!page) {
    const bmRes = await fetch(
      `${GRAPH_BASE}/me/businesses?fields=owned_pages{id,name,access_token}&limit=10&access_token=${longLivedToken}`
    )
    const bmBody = await bmRes.json() as { data?: Array<{ owned_pages?: { data: FBPage[] } }> }
    page = bmBody.data?.[0]?.owned_pages?.data?.[0]
  }

  if (!page) {
    throw new Error('No Facebook Pages found. Please connect a Facebook Page managed directly by your account.')
  }
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 60)

  const { error } = await admin
    .from('social_connections')
    .upsert(
      {
        client_id: clientId,
        platform: 'facebook',
        account_id: page.id,
        account_name: page.name,
        access_token: page.access_token,
        token_expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'client_id,platform' }
    )

  if (error) throw new Error(`Failed to save Facebook connection: ${error.message}`)
}

// ---- Route handler ----

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

  let clientId: string
  let platform: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      clientId: string
      platform: string
    }
    clientId = decoded.clientId
    platform = decoded.platform
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients?meta_error=invalid_state`
    )
  }

  const redirectUri = process.env.META_REDIRECT_URI!
  const errorRedirect = `${process.env.NEXT_PUBLIC_APP_URL}/clients/${clientId}/edit?meta_error=1`
  const admin = createAdminSupabaseClient()

  try {
    if (platform === 'instagram') {
      // Instagram Business Login flow
      const shortLived = await exchangeInstagramCode(code, redirectUri)
      const longLived = await exchangeInstagramForLongLived(shortLived.access_token)
      await connectInstagram(longLived.access_token, shortLived.user_id, longLived.expires_in, clientId, admin)
    } else if (platform === 'facebook') {
      // Facebook Pages flow
      const shortLived = await exchangeFacebookCode(code, redirectUri)
      const longLived = await exchangeFacebookForLongLived(shortLived.access_token)
      await connectFacebook(longLived.access_token, clientId, admin)
    } else {
      return NextResponse.redirect(errorRedirect)
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/clients/${clientId}/edit?meta_connected=${platform}`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Meta OAuth callback error:', message)
    return NextResponse.redirect(
      `${errorRedirect}&meta_error_detail=${encodeURIComponent(message)}`
    )
  }
}
