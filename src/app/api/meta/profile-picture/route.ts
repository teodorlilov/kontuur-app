import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { IG_GRAPH_BASE, META_GRAPH_BASE } from '../meta-constants'

/**
 * Resolves the live profile picture for a connected social account and
 * redirects to the CDN image URL. The access token never leaves the server —
 * we look up the (short-lived, signed) image URL via the Graph API and 302 to it.
 *
 * Used as an <img src> in the connected-accounts settings card.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connection_id')
  if (!connectionId) {
    return NextResponse.json({ error: 'connection_id is required' }, { status: 400 })
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  // Admin read: the access_token is deliberately excluded from the user-scoped
  // SOCIAL_CONNECTION_COLUMNS, so read it here with the service-role client.
  const admin = createAdminSupabaseClient()
  const { data: connection } = await admin
    .from('social_connections')
    .select('client_id, platform, account_id, access_token')
    .eq('id', connectionId)
    .single()

  if (!connection?.client_id || !connection.access_token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Ownership check with the user-scoped client before exposing anything.
  const owned = await verifyClientOwnership(supabase, connection.client_id, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const imageUrl = await resolvePictureUrl(
      connection.platform,
      connection.account_id,
      connection.access_token
    )
    if (!imageUrl) return NextResponse.json({ error: 'No picture' }, { status: 404 })

    const res = NextResponse.redirect(imageUrl, 302)
    // Cache the redirect briefly: limits Graph API calls without outliving the
    // signed CDN URL it points to.
    res.headers.set('Cache-Control', 'private, max-age=300')
    return res
  } catch {
    return NextResponse.json({ error: 'Failed to resolve picture' }, { status: 404 })
  }
}

/** Fetch the current profile-picture URL from the platform's Graph API. */
async function resolvePictureUrl(
  platform: string | null,
  accountId: string | null,
  accessToken: string
): Promise<string | null> {
  if (platform === 'instagram') {
    const res = await fetch(
      `${IG_GRAPH_BASE}/me?fields=profile_picture_url&access_token=${accessToken}`
    )
    if (!res.ok) return null
    const body = (await res.json()) as { profile_picture_url?: string }
    return body.profile_picture_url ?? null
  }

  if (platform === 'facebook' && accountId) {
    const res = await fetch(
      `${META_GRAPH_BASE}/${accountId}/picture?type=large&redirect=false&access_token=${accessToken}`
    )
    if (!res.ok) return null
    const body = (await res.json()) as { data?: { url?: string } }
    return body.data?.url ?? null
  }

  return null
}
