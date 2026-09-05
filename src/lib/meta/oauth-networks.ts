import 'server-only'

import { FB_AUTHORIZE_URL, IG_AUTHORIZE_URL } from '@/lib/meta/constants'

/**
 * The networks the connect flow can start, and what starting one takes.
 *
 * The route and the signed state both had `'instagram'` written into them, so adding a second
 * network meant editing a gate in two files and hoping they agreed. They read this instead —
 * shared machinery never names a network, which is the same rule that keeps `NetworkAdapter`
 * out of the publish path's branches.
 *
 * Connecting is not the same question as publishing, so this is deliberately NOT the network
 * registry: `facebook_user` is a token this app holds and never publishes to, and Canva
 * connects without being a network at all.
 */
/**
 * The platform of the user-scoped Facebook token, which is not a network anyone publishes to.
 *
 * It exists because Facebook consent yields a token that lists Pages rather than naming one, so
 * the token is held between consent and the Page being chosen. Named here so nothing has to
 * spell the string out: it must stay outside the publishing vocabulary, or `resolveDestinations`
 * would try to send posts to it.
 */
export const FACEBOOK_USER_PLATFORM = 'facebook_user'

export const OAUTH_PLATFORMS = ['instagram', 'facebook'] as const
export type OAuthPlatform = (typeof OAUTH_PLATFORMS)[number]

export function isOAuthPlatform(value: string): value is OAuthPlatform {
  return (OAUTH_PLATFORMS as readonly string[]).includes(value)
}

interface OAuthNetwork {
  authorizeUrl: string
  /** Comma-joined, as both dialogs expect. */
  scopes: string
  appIdEnv: 'META_INSTAGRAM_APP_ID' | 'META_APP_ID'
}

const NETWORKS: Record<OAuthPlatform, OAuthNetwork> = {
  /**
   * `manage_comments` is requested even though the app holds only Standard Access for it. That
   * is the order Meta requires: Advanced Access comes through App Review, and App Review expects
   * to see successful calls against the permission first. Meta drops a permission the app is not
   * approved for rather than erroring, and anyone holding a role on the app does get it — which
   * is how the flow is exercised before review.
   */
  instagram: {
    authorizeUrl: IG_AUTHORIZE_URL,
    scopes: [
      'instagram_business_basic',
      'instagram_business_manage_insights',
      'instagram_business_content_publish',
      'instagram_business_manage_comments',
    ].join(','),
    appIdEnv: 'META_INSTAGRAM_APP_ID',
  },
  /**
   * `pages_show_list` is what lists the Pages a person administers; the other three are what a
   * Page connection is for. All four are Advanced-Access permissions granted by App Review, and
   * the same Standard-Access reasoning above applies until it is.
   */
  facebook: {
    authorizeUrl: FB_AUTHORIZE_URL,
    scopes: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
    ].join(','),
    appIdEnv: 'META_APP_ID',
  },
}

/** The consent URL to send the browser to, or null when that network is not configured. */
export function authorizeUrlFor(
  platform: OAuthPlatform,
  redirectUri: string,
  state: string
): string | null {
  const network = NETWORKS[platform]
  const appId = process.env[network.appIdEnv]
  if (!appId) return null

  const url = new URL(network.authorizeUrl)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', network.scopes)
  url.searchParams.set('state', state)
  return url.toString()
}
