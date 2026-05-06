export const CANVA_API_BASE = 'https://api.canva.com/rest/v1'
export const CANVA_OAUTH_BASE = 'https://www.canva.com/api/oauth/authorize'
export const CANVA_TOKEN_URL = `${CANVA_API_BASE}/oauth/token`

export const CANVA_SCOPES = [
  'design:content:read',
  'design:meta:read',
  'design:content:write',
  'asset:read',
].join(' ')
