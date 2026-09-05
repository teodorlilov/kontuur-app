'use server'

import { revalidateTag } from 'next/cache'
import { resolveActionAuth, verifyClientOwnership } from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { syncClientComments } from '../lib/sync-comments'
import {
  SOCIAL_CONNECTION_AUTH_COLUMNS,
  type SocialConnectionAuthColumns,
} from '@/lib/queries/select-columns'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { COMMENTABLE_PLATFORMS, resolveComments } from '@/lib/meta/networks'
import type { CommentsAdapter } from '@/lib/meta/networks/types'
import { GraphApiError } from '@/lib/meta/graph-errors'
import {
  deleteCommentInputSchema,
  replyToCommentInputSchema,
  setCommentHiddenInputSchema,
  type DeleteCommentInput,
  type ReplyToCommentInput,
  type SetCommentHiddenInput,
} from '../schemas'
import { PLATFORM_COMMENTS_TAG } from '../queries/comment-queue'

/**
 * Moderating a comment: reply, hide, delete.
 *
 * Each does the Graph call and then writes the same change to `platform_comments`, so the
 * queue is right immediately rather than at the next cron. The write is not a cache
 * — it is the same fact the sync would have brought back in half an hour, recorded
 * early by the party that caused it.
 */

interface CommentScope {
  clientId: string
  /** Whose comment it is. Everything below acts through this network's adapter. */
  adapter: CommentsAdapter
  mediaId: string
  accountId: string
  accountName: string | null
  accessToken: string
  admin: ReturnType<typeof createAdminSupabaseClient>
}

/**
 * Everything an action needs before it is allowed to touch a comment.
 *
 * The ownership problem here is sharper than usual and worth naming. The argument is
 * an Instagram comment id, which belongs to Instagram's id space and carries no
 * agency, no client, no tenancy of any kind. Passing one straight to the Graph API
 * would moderate whatever it names, on whatever account the token can reach.
 *
 * So the id is resolved through OUR row first: the stored comment says which client
 * it belongs to, that client is checked against the caller's agency, and only then is
 * a token loaded. A comment id we have never synced is simply not found — which is
 * the right answer for both a typo and an attack.
 */
async function resolveComment(
  commentId: string
): Promise<{ ok: true; scope: CommentScope } | { ok: false; error: string }> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('platform_comments')
    .select('client_id, platform, platform_account_id, external_post_id')
    .eq('id', commentId)
    .maybeSingle()
  if (error) return { ok: false, error: 'Could not read that comment' }
  if (!data) return { ok: false, error: 'Not found' }
  const row = data

  const owned = await verifyClientOwnership(auth.supabase, row.client_id, auth.agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  // The comment's OWN network, not a fixed one: a client may have both connected, and acting
  // on a Facebook comment with an Instagram token is the mix-up this lookup exists to prevent.
  const adapter = resolveComments(row.platform)
  if (!adapter) return { ok: false, error: 'That network cannot be moderated from here' }

  const { data: connectionData } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
    .eq('client_id', row.client_id)
    .eq('platform', adapter.platform)
    .maybeSingle()
  const connection = connectionData as SocialConnectionAuthColumns | null
  if (!connection?.access_token) {
    return { ok: false, error: `This client has no connected ${adapter.label} account` }
  }
  if (isTokenExpired(connection.token_expires_at)) {
    return {
      ok: false,
      error: `The ${adapter.label} connection has expired — reconnect to continue`,
    }
  }
  /**
   * The comment was synced under one account and the client is now connected to
   * another. The stored row is about to be purged by the OAuth callback; acting on it
   * would spend the NEW account's token on the OLD account's comment, which Instagram
   * would refuse anyway — but refusing here says why.
   */
  if (connection.account_id !== row.platform_account_id) {
    return { ok: false, error: 'This comment belongs to a previously connected account' }
  }

  return {
    ok: true,
    scope: {
      clientId: row.client_id,
      adapter,
      mediaId: row.external_post_id,
      // Equal to the connection's by the check above, and taken from the row because
      // that is the account the reply will actually be filed under.
      accountId: row.platform_account_id,
      accountName: connection.account_name,
      accessToken: connection.access_token,
      admin,
    },
  }
}

/**
 * Graph failures, in words the agency can act on.
 *
 * `permission` is the one that matters and the one most likely to be misread: it does
 * NOT mean the app is missing Advanced Access — that failure is silent, a 200 with an
 * empty list. It means THIS connection's token predates the
 * `instagram_business_manage_comments` scope, because tokens never gain permissions
 * after they are issued. The client can fix it today by reconnecting, which is why
 * the message says so.
 */
function describe(err: unknown, fallback: string): string {
  if (err instanceof GraphApiError) {
    if (err.failure === 'permission') {
      return 'This connection predates comment moderation — reconnect the account to enable it'
    }
    if (err.failure === 'token_invalid') return 'The Instagram connection needs reconnecting'
    if (err.failure === 'rate_limited') return 'Instagram is rate limiting us — try again shortly'
  }
  console.error(`[comments] ${fallback}:`, err)
  return fallback
}

/** Reply as the client's own account, and thread it under the comment being answered. */
export async function replyToComment(input: ReplyToCommentInput): Promise<ActionResult<void>> {
  const parsed = replyToCommentInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid reply' }
  const { commentId, message } = parsed.data

  const resolved = await resolveComment(commentId)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved

  let replyId: string
  try {
    replyId = await scope.adapter.reply({
      account: { accountId: scope.accountId, accessToken: scope.accessToken },
      commentId,
      message,
    })
  } catch (err) {
    return { ok: false, error: describe(err, 'Could not post that reply') }
  }

  /**
   * Recorded rather than waited for. Without this row the comment reads as
   * unanswered until the next cron — up to half an hour of the queue telling
   * someone to do what they have just done.
   *
   * `author_username` is the connected account's handle because that is who
   * Instagram will show as the author, and it is what `commentStatus` matches on to
   * decide the parent is answered. A null here would leave the status unchanged and
   * make the write pointless.
   */
  const { error } = await scope.admin.from('platform_comments').insert({
    id: replyId,
    client_id: scope.clientId,
    platform: scope.adapter.platform,
    platform_account_id: scope.accountId,
    external_post_id: scope.mediaId,
    parent_id: commentId,
    author_username: scope.accountName,
    text: message,
    hidden: false,
    commented_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  })
  // The reply IS posted. A failed local write is a staleness bug, not a lost reply,
  // and telling the user it failed would invite them to post it twice.
  if (error) console.error('[comments] reply row insert failed:', error.message)

  revalidateTag(PLATFORM_COMMENTS_TAG, 'max')
  return { ok: true, data: undefined }
}

/** Hide or unhide. The reversible moderation action, and the one to prefer. */
export async function setCommentHidden(input: SetCommentHiddenInput): Promise<ActionResult<void>> {
  const parsed = setCommentHiddenInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request' }
  const { commentId, hidden } = parsed.data

  const resolved = await resolveComment(commentId)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved

  try {
    await scope.adapter.setHidden({
      account: { accountId: scope.accountId, accessToken: scope.accessToken },
      commentId,
      hidden,
    })
  } catch (err) {
    return { ok: false, error: describe(err, hidden ? 'Could not hide it' : 'Could not unhide it') }
  }

  const { error } = await scope.admin
    .from('platform_comments')
    .update({ hidden })
    .eq('id', commentId)
  if (error) console.error('[comments] hidden flag update failed:', error.message)

  revalidateTag(PLATFORM_COMMENTS_TAG, 'max')
  return { ok: true, data: undefined }
}

/** Delete. Irreversible on Instagram's side — the UI should push people to hide instead. */
export async function deleteComment(input: DeleteCommentInput): Promise<ActionResult<void>> {
  const parsed = deleteCommentInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request' }
  const { commentId } = parsed.data

  const resolved = await resolveComment(commentId)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved

  try {
    await scope.adapter.remove({
      account: { accountId: scope.accountId, accessToken: scope.accessToken },
      commentId,
    })
  } catch (err) {
    return { ok: false, error: describe(err, 'Could not delete it') }
  }

  /**
   * Its replies go with it: Instagram removes the thread, and a reply row whose
   * parent is gone is dropped by the queue anyway. Deleting both keeps the sync's
   * count comparison honest.
   *
   * Two statements rather than one `.or()`, following the rule
   * `purge-account-metrics.ts` states for the same reason: a comment id comes from
   * Meta and is not going anywhere near a PostgREST filter string, however well the
   * schema has already vetted it.
   */
  const [self, children] = await Promise.all([
    scope.admin.from('platform_comments').delete().eq('id', commentId),
    scope.admin.from('platform_comments').delete().eq('parent_id', commentId),
  ])
  const failure = self.error ?? children.error
  if (failure) console.error('[comments] comment row delete failed:', failure.message)

  revalidateTag(PLATFORM_COMMENTS_TAG, 'max')
  return { ok: true, data: undefined }
}

/**
 * Ask Instagram for one client's comments now, instead of waiting for the cron.
 *
 * ONE client, deliberately. A button that swept every client would be a bulk
 * operation across the roster, and it would put an unbounded burst on an app-wide
 * Meta quota that scheduled publishing shares — the exact cost that made the whole
 * feature sync-then-read rather than fetch-on-render. The cron is the thing allowed
 * to touch every client, because it is sequential, time-budgeted, and stops on the
 * first rate limit.
 *
 * Cheap to press twice: `syncClientComments` fetches comments only for posts whose
 * count disagrees with what is stored, so a second press seconds later costs one
 * media call rather than one per post.
 *
 * Not a new operation — it calls the same `syncClientComments` the cron does, which
 * is why `docs/OPERATIONS.md` needs no new row for it.
 */
export async function checkClientComments(
  clientId: string
): Promise<ActionResult<{ postsWithNewComments: number }>> {
  const parsed = parseActionId(clientId, 'client')
  if (!parsed.ok) return parsed.result

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const owned = await verifyClientOwnership(auth.supabase, parsed.id, auth.agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const admin = createAdminSupabaseClient()
  /**
   * Every commentable network this client has, not a fixed one.
   *
   * "Check this client's comments" means all of them: a client with both connected who was
   * only ever swept for Instagram would press the button, see it succeed, and still be missing
   * everything said on their Page.
   */
  const { data } = await admin
    .from('social_connections')
    .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
    .eq('client_id', parsed.id)
    .in('platform', COMMENTABLE_PLATFORMS)
  const connections = (data ?? []) as SocialConnectionAuthColumns[]
  const usable = connections.filter(
    (connection) => connection.access_token && !isTokenExpired(connection.token_expires_at)
  )
  if (usable.length === 0) {
    // Naming what is wrong: nothing connected at all reads differently from a connection that
    // has expired, and only one of the two is fixed by reconnecting.
    return connections.length === 0
      ? { ok: false, error: 'This client has no connected account to check' }
      : { ok: false, error: 'The connection has expired — reconnect to continue' }
  }

  /**
   * Each network on its own. One failing must not cost the others their sync — this ran the
   * whole loop inside a single try, so a client whose Instagram token predates comment
   * moderation never reached its Facebook Page at all, and the action reported nothing but the
   * Instagram error.
   */
  let postsWithNewComments = 0
  const failures: string[] = []
  for (const connection of usable) {
    try {
      const result = await syncClientComments(admin, {
        clientId: parsed.id,
        platform: connection.platform,
        accountId: connection.account_id,
        accessToken: connection.access_token!,
      })
      postsWithNewComments += result.fetched
    } catch (err) {
      console.error(`[comments] ${connection.platform} check failed for ${parsed.id}:`, err)
      failures.push(describe(err, `Could not reach ${connection.platform} just now`))
    }
  }

  // Only when NOTHING worked is this a failed check. A partial run still brought comments in,
  // and reporting it as a failure would hide them behind an error about a different network.
  if (failures.length === usable.length) return { ok: false, error: failures[0]! }

  revalidateTag(PLATFORM_COMMENTS_TAG, 'max')
  return { ok: true, data: { postsWithNewComments } }
}
