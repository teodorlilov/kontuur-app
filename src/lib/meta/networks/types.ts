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
