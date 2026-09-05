import type { PostType } from '@/types/api'

/**
 * What a social network can do, as the publish path sees it.
 *
 * The publish path owns the claim, the retry ladder and every database write; a
 * network owns talking to its own API. Neither knows the other's business, which
 * is the point: adding a network must not mean adding a branch to the
 * orchestration, and it must not mean a second function writing the same rows.
 *
 * TWO RULES MAKE THAT HOLD, and both are load-bearing.
 *
 * 1. **An adapter never touches the database.** It receives a payload and
 *    returns a result. If it needed to persist something mid-flight it would end
 *    up writing the same columns the orchestration writes, from a second place —
 *    which is how a schema drifts apart. Instagram's two-phase publish is
 *    expressed as `publish` returning `pending` and the caller persisting the
 *    reference before calling `resume`.
 * 2. **An adapter never decides policy.** Whether a failure is final, how many
 *    attempts remain, whether to notify — none of that is here. An adapter
 *    reports what the network did; the ladder decides what it means.
 */
export interface NetworkAdapter {
  readonly platform: string
  /**
   * The network's name as a person reads it — "Instagram", not "instagram".
   *
   * Failure messages and notifications name the network they are about, and this
   * is the only place that mapping lives. Without it those strings get hard-coded
   * in shared code, which is how "A scheduled Instagram post could not be
   * published" ends up describing a Facebook failure.
   */
  readonly label: string

  /**
   * Which kinds of post this network takes.
   *
   * The capability rule lives on the network, not in a constant beside it. A list of
   * "publishable platforms" kept elsewhere would be a second source of truth that has to
   * stay in agreement with the adapters — and the one that goes stale is always the list.
   */
  accepts(postType: PostType): boolean

  /**
   * Why this content cannot go to this network, checked before anything is
   * claimed so a doomed post never burns an attempt.
   *
   * `final` means no retry can help — a PNG where the network demands JPEG stays
   * a PNG. Connection problems are NOT checked here: a missing or expired token
   * is the same fact on every network, so the orchestration owns it.
   */
  preflight(payload: PostPayload): PreflightBlocker | null

  publish(input: PublishInput): Promise<NetworkPublishResult>

  /**
   * Finish a publish that returned `pending`.
   *
   * Only ever called with a reference this adapter itself produced. A network
   * that publishes in one call throws here, because reaching it would mean the
   * orchestration invented a reference.
   */
  resume(input: ResumeInput): Promise<NetworkPublishResult>

  /**
   * Where a person can see the published post, from the id the network gave us.
   *
   * Optional because not every network need offer one, and it is a LOOKUP rather than a stored
   * field on purpose: a post deleted on the network must read as gone, not as a link that
   * quietly 404s. It throws when the network no longer has it, and the caller decides what to
   * say — an adapter reports, it does not judge.
   */
  permalink?(account: NetworkAccount, externalPostId: string): Promise<string | null>

  /**
   * Publishes left in the current window, when the network caps them.
   *
   * Optional because the cap is not a universal idea — Instagram meters API
   * publishes per rolling 24h and most networks do not. Absent means unmetered;
   * callers must not read that as zero.
   */
  quotaRemaining?(account: NetworkAccount): Promise<number>
}

/** The credentials one network call needs. Expiry is checked before we get here. */
export interface NetworkAccount {
  accountId: string
  accessToken: string
}

export interface PublishableMedia {
  publicUrl: string
  position: number
  contentType: string | null
}

/**
 * The content to publish — deliberately not the `posts` row.
 *
 * Passing the row would hand every adapter the claim state, the attempt counter
 * and the client id, none of which are its business, and would make the contract
 * import from the publish path that imports it.
 */
export interface PostPayload {
  caption: string
  /** Ordered by position. A network decides for itself what more than one means. */
  media: PublishableMedia[]
}

export interface PublishInput {
  account: NetworkAccount
  payload: PostPayload
}

export interface ResumeInput {
  account: NetworkAccount
  publishRef: string
  /**
   * How long this caller can afford to wait, in ms. Omitted means the network's
   * own default.
   *
   * The manual "Publish now" path finishes out of band and can wait far longer
   * than a cron tick, which is what lets a single image confirm in one request
   * instead of rolling to the next run. The network still owns the default —
   * only the caller knows it has more time than usual.
   */
  pollBudgetMs?: number
  /**
   * When the current attempt took its claim, as epoch ms.
   *
   * Instagram needs it to recover from a container that reports PUBLISHED
   * without handing back an id: the newest media posted since the claim is this
   * post. Null when the attempt was never stamped.
   */
  claimedAt: number | null
}

export type NetworkPublishResult =
  /** Live. `externalPostId` is null when the network published but withheld the id. */
  | { kind: 'published'; externalPostId: string | null }
  /** Accepted but not live yet. The caller persists `publishRef` and resumes later. */
  | { kind: 'pending'; publishRef: string }
  /**
   * The network refused this attempt and any reference it held is dead.
   *
   * Distinct from throwing: a thrown `GraphApiError` carries a classification the
   * ladder reads, whereas this is the network answering normally with a "no".
   */
  | { kind: 'rejected'; reason: string }

export interface PreflightBlocker {
  message: string
  final: boolean
}

/**
 * One comment, as the queue stores and shows it — the vocabulary `platform_comments` uses.
 *
 * Neither network's field names survive here on purpose. Instagram says `text`/`username`/
 * `timestamp`/`hidden`; Facebook says `message`/`from.name`/`created_time`/`is_hidden`. A queue
 * that spoke either network's dialect would have to learn the other's the moment a second one
 * arrived, which is the shape this whole arc exists to avoid.
 */
export interface PlatformComment {
  id: string
  /** Null for a top-level comment; otherwise the comment this one answers. */
  parentId: string | null
  /**
   * Who said it, as a person reads it.
   *
   * A handle on Instagram and a display name on Facebook. Both answer the same question and
   * neither is more correct, so the column holds whichever the network gives.
   */
  authorName: string | null
  text: string | null
  hidden: boolean
  /**
   * Whether this network will let us hide THIS comment.
   *
   * Per comment, not per network: Facebook refuses to hide a Page's own comment and says so
   * before the attempt. Offering a control the network has already refused is worse than not
   * offering it.
   */
  canHide: boolean
  likeCount: number | null
  commentedAt: string | null
}

export interface PostComments {
  comments: PlatformComment[]
  /**
   * The post HAS comments the network would not give us — a permissions state, not an empty
   * post and not an error.
   *
   * Instagram answers 200 with an empty list while the media's own count reads correctly, until
   * the app holds Advanced Access for `instagram_business_manage_comments`. It is reported by
   * the adapter rather than derived by the caller because whether an empty list means "none" or
   * "withheld" is a fact about the network, and the two networks may not answer it the same way.
   */
  withheld: boolean
  nextCursor: string | null
}

/**
 * Reading and moderating one network's comments.
 *
 * Deliberately separate from `NetworkAdapter`: publishing and moderating are different
 * capabilities, and a network could plausibly have one without the other. They share
 * `NetworkAccount` because they need the same credentials, and nothing else.
 *
 * The same two rules hold as for publishing: an adapter never touches the database, and never
 * decides policy. It speaks its network's dialect and returns `PlatformComment`.
 */
/**
 * A post worth checking for new comments, with what this network already told us about it.
 *
 * `commentCount` is the network's own tally, used to skip posts nothing has been said on since
 * last time. It is deliberately the ONLY thing the sync needs — everything else is enrichment.
 */
export interface CommentablePost {
  externalPostId: string
  commentCount: number
  /**
   * What the post IS, for the queue to render above its comments — and null when this network
   * has nowhere to keep it.
   *
   * Instagram's identity lands in `platform_post_metrics`, which is that network's own table: it is
   * keyed on `ig_media_id`/`ig_account_id` and swept by Instagram-scoped deletes, so a Facebook
   * row in it would be wrong in both directions. Until a neutral home exists, Facebook returns
   * null and the queue falls back to Kontuur's own record of a post it published.
   */
  identity: {
    caption: string | null
    permalink: string | null
    thumbnailUrl: string | null
    mediaType: string | null
    mediaProductType: string | null
    postedAt: string | null
  } | null
}

export interface CommentsAdapter {
  readonly platform: string
  /** The network's name as a person reads it, for copy that must say which one withheld a comment. */
  readonly label: string

  /**
   * The posts worth checking, newest first, since the given instant.
   *
   * Which posts a network HAS is its own question — Instagram lists media, a Page lists
   * published posts — and both answer it in one call that also carries the comment count, which
   * is what makes the compare-then-fetch cheap.
   */
  listCommentablePosts(input: {
    account: NetworkAccount
    since: string
  }): Promise<CommentablePost[]>

  /**
   * Every comment on one post, replies included, however this network reaches them.
   *
   * `expectedCount` is the post's own comment count, which the caller already holds — the only
   * way to tell "no comments" from "withheld", since the edge reports both as an empty array.
   *
   * How replies arrive is the network's business: Instagram nests them in the same response,
   * Facebook keeps them on a second edge. Neither shape reaches the caller.
   */
  fetchComments(input: {
    account: NetworkAccount
    externalPostId: string
    expectedCount: number
    after?: string
  }): Promise<PostComments>

  /** Answer a comment as the connected account. Returns the new comment's id. */
  reply(input: { account: NetworkAccount; commentId: string; message: string }): Promise<string>

  /** Hide or unhide. Reversible, and preferred over deleting. */
  setHidden(input: { account: NetworkAccount; commentId: string; hidden: boolean }): Promise<void>

  /** Delete a comment. Irreversible. */
  remove(input: { account: NetworkAccount; commentId: string }): Promise<void>
}
