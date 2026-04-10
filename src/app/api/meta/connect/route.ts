import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { META_GRAPH_VERSION } from '../meta-constants'

// Instagram Business Login — direct instagram.com OAuth (no Facebook Page required)
const INSTAGRAM_BUSINESS_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_business_content_publish',
].join(',')

// Facebook Pages OAuth
// Note: business_management is included but requires Meta app review for production.
// In development mode it only works for app admins/testers.
const FACEBOOK_PAGE_SCOPES = [
  'pages_read_engagement',
  'pages_show_list',
  'pages_manage_metadata',
  'read_insights',
  'business_management',
].join(',')

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const platform = searchParams.get('platform')

  if (!clientId || !platform || !['instagram', 'facebook'].includes(platform)) {
    return NextResponse.json({ error: 'client_id and platform (instagram|facebook) are required' }, { status: 400 })
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId } = auth

  const owned = await verifyClientOwnership(auth.supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fbAppId = process.env.META_APP_ID
  const igAppId = process.env.META_INSTAGRAM_APP_ID
  const redirectUri = process.env.META_REDIRECT_URI
  if (!fbAppId || !igAppId || !redirectUri) {
    return NextResponse.json({ error: 'Meta app not configured' }, { status: 500 })
  }

  const state = Buffer.from(JSON.stringify({ clientId, platform })).toString('base64url')

  let oauthUrl: URL
  if (platform === 'instagram') {
    // Instagram Business Login — redirects to instagram.com consent page
    oauthUrl = new URL('https://www.instagram.com/oauth/authorize')
    oauthUrl.searchParams.set('client_id', igAppId)
    oauthUrl.searchParams.set('redirect_uri', redirectUri)
    oauthUrl.searchParams.set('scope', INSTAGRAM_BUSINESS_SCOPES)
    oauthUrl.searchParams.set('state', state)
    oauthUrl.searchParams.set('response_type', 'code')
  } else {
    // Facebook Pages OAuth
    oauthUrl = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`)
    oauthUrl.searchParams.set('client_id', fbAppId)
    oauthUrl.searchParams.set('redirect_uri', redirectUri)
    oauthUrl.searchParams.set('scope', FACEBOOK_PAGE_SCOPES)
    oauthUrl.searchParams.set('state', state)
    oauthUrl.searchParams.set('response_type', 'code')
  }

  return NextResponse.redirect(oauthUrl.toString())
}
