import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { IG_METRICS_TAG } from '@/features/analytics/lib/report-data'
import { purgeAccountAnalytics } from '@/features/analytics/lib/purge-account-metrics'

function base64UrlDecode(str: string): Buffer {
  // Convert base64url to standard base64
  const base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
  return Buffer.from(base64, 'base64')
}

function verifySignedRequest(signedRequest: string, appSecret: string): { user_id: string } | null {
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null
  const encodedSig = parts[0]!
  const payload = parts[1]!

  const expectedSig = createHmac('sha256', appSecret).update(payload).digest()
  const receivedSig = base64UrlDecode(encodedSig)

  if (expectedSig.length !== receivedSig.length) return null
  if (!timingSafeEqual(expectedSig, receivedSig)) return null

  try {
    return JSON.parse(base64UrlDecode(payload).toString('utf8')) as { user_id: string }
  } catch {
    return null
  }
}

/** Meta's mandated data-deletion callback. Verifies Meta's HMAC signature before deleting anything. */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  let signedRequest: string | null = null

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    const params = new URLSearchParams(text)
    signedRequest = params.get('signed_request')
  } else {
    // Some integrations send JSON
    try {
      const body = (await request.json()) as { signed_request?: string }
      signedRequest = body.signed_request ?? null
    } catch {
      // ignore
    }
  }

  if (!signedRequest) {
    return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 })
  }

  // Meta signs with whichever app's secret issued the request — accept either.
  // (The old two-step version dropped the alternate parse into a throwaway
  // object and then crashed reading user_id off the null primary.)
  const secrets = [process.env.META_APP_SECRET, process.env.META_INSTAGRAM_APP_SECRET].filter(
    (secret): secret is string => !!secret
  )
  let parsed: { user_id: string } | null = null
  for (const secret of secrets) {
    parsed = verifySignedRequest(signedRequest, secret)
    if (parsed?.user_id) break
  }
  if (!parsed?.user_id) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const userId = parsed.user_id
  const confirmationCode = `${userId}-${Date.now()}`

  const admin = createAdminSupabaseClient()

  try {
    await eraseAccountData(admin, userId)
  } catch (err) {
    // The boundary logs once. Answering 200 here is what let a failed erasure
    // reach the user as "your data has been removed" — the page this route
    // redirects to says exactly that. A 500 earns a retry from Meta instead.
    console.error(`[meta/data-deletion] erasure failed for account ${userId}:`, err)
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 })
  }

  const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL}/data-deletion?code=${encodeURIComponent(confirmationCode)}`

  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode })
}

/**
 * Remove every trace of one Instagram account: its synced analytics first, then
 * the connections that point at it.
 *
 * Order is load-bearing. `social_connections` is the only thing linking Meta's
 * user id to our client ids, so the lookup has to happen while the rows still
 * exist — delete first and the analytics become unreachable, which is the exact
 * state this function was written to stop happening.
 */
async function eraseAccountData(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string
): Promise<void> {
  // Narrow lookup, inline by convention: select-columns.ts covers full-row
  // selects, and db.ts takes a helper only at a second call site. This has one.
  // The platform filter is not optional — Canva writes into this same table
  // with its own id space and a null client_id.
  const { data, error } = await admin
    .from('social_connections')
    .select('client_id')
    .eq('account_id', userId)
    .eq('platform', 'instagram')
  if (error) throw new Error(`connection lookup failed: ${error.message}`)

  const clientIds = (data ?? [])
    .map((row) => row.client_id)
    .filter((id): id is string => typeof id === 'string')

  for (const clientId of clientIds) {
    await purgeAccountAnalytics(admin, clientId, userId, { includeUnstampedReports: true })
  }

  // Unfiltered by platform, unlike the lookup above: narrowing a live Meta
  // endpoint's delete is a behaviour change this task did not ask for, and the
  // account id spaces have never been observed to collide.
  const { error: deleteError } = await admin
    .from('social_connections')
    .delete()
    .eq('account_id', userId)
  if (deleteError) throw new Error(`connection delete failed: ${deleteError.message}`)

  if (clientIds.length > 0) revalidateTag(IG_METRICS_TAG, 'max')
}
