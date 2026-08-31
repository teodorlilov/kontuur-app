import type { SocialConnectionAuthColumns } from '@/lib/queries/select-columns'

/**
 * Instagram connection credentials from the social_connections table.
 *
 * `access_token` is null after the token refresher retires a dead token — the publish preflight
 * reports that as "needs reconnecting" rather than calling Meta with nothing.
 *
 * An alias, not a declaration. This restated `SocialConnectionAuthColumns` field for field, which
 * existed already and was itself added because callers were hand-writing this shape. `account_id`
 * is narrowed because every query behind it filters the column.
 */
export type InstagramConnection = SocialConnectionAuthColumns & { account_id: string }
