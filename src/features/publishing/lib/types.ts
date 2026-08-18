/**
 * Instagram connection credentials from the social_connections table.
 * access_token is null after the token refresher retires a dead token — the
 * publish preflight reports that as "needs reconnecting" rather than calling
 * Meta with nothing.
 */
export interface InstagramConnection {
  account_id: string
  access_token: string | null
  token_expires_at: string | null
}
