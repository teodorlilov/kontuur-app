const META_GRAPH_VERSION = 'v25.0'
export const IG_GRAPH_BASE = `https://graph.instagram.com/${META_GRAPH_VERSION}`

// Instagram Business Login endpoints. The authorize/token pair is unversioned
// by design (instagram.com OAuth); refresh lives on the graph host.
export const IG_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
export const IG_OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
export const IG_TOKEN_EXCHANGE_URL = `${IG_GRAPH_BASE}/access_token`
export const IG_TOKEN_REFRESH_URL = `${IG_GRAPH_BASE}/refresh_access_token`
