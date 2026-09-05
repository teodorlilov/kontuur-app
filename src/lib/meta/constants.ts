const META_GRAPH_VERSION = 'v25.0'
export const IG_GRAPH_BASE = `https://graph.instagram.com/${META_GRAPH_VERSION}`

// Instagram Business Login endpoints. The authorize/token pair is unversioned
// by design (instagram.com OAuth); refresh lives on the graph host.
export const IG_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
export const IG_OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
export const IG_TOKEN_EXCHANGE_URL = `${IG_GRAPH_BASE}/access_token`
export const IG_TOKEN_REFRESH_URL = `${IG_GRAPH_BASE}/refresh_access_token`

/**
 * Facebook Login, for Pages. A different host and a different app from Instagram Business
 * Login — `META_APP_ID`/`META_APP_SECRET` rather than the `META_INSTAGRAM_*` pair.
 *
 * One token endpoint does both exchanges: the code swap and the long-lived upgrade, which is
 * the same URL with `grant_type=fb_exchange_token`.
 */
export const FB_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`
export const FB_AUTHORIZE_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`
export const FB_OAUTH_TOKEN_URL = `${FB_GRAPH_BASE}/oauth/access_token`
