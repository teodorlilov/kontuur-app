import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

function base64UrlDecode(str: string): Buffer {
  // Convert base64url to standard base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
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

  // Try the Facebook app secret first, fall back to Instagram app secret
  const appSecret = process.env.META_APP_SECRET ?? process.env.META_INSTAGRAM_APP_SECRET ?? ''
  const parsed = verifySignedRequest(signedRequest, appSecret)

  if (!parsed?.user_id) {
    // Try the other secret if the first failed
    const altSecret = process.env.META_INSTAGRAM_APP_SECRET ?? ''
    const altParsed = altSecret ? verifySignedRequest(signedRequest, altSecret) : null
    if (!altParsed?.user_id) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
    Object.assign(parsed ?? {}, altParsed)
  }

  const userId = (parsed as { user_id: string }).user_id
  const confirmationCode = `${userId}-${Date.now()}`

  const admin = createAdminSupabaseClient()
  await admin.from('social_connections').delete().eq('account_id', userId)

  const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL}/data-deletion?code=${encodeURIComponent(confirmationCode)}`

  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode })
}
