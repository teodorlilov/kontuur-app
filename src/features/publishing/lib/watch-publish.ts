/**
 * Client-side guard for a deferred publish: the dialog closes as soon as the
 * container exists, and this watcher reports the real outcome afterwards — so a
 * failure that lands after the dialog is gone still reaches the user instead of
 * dying silently in a row they are no longer looking at.
 */

import { toPublicationSummary, type PublicationSummary } from '@/lib/posts/publish-state'
import type { PublicationEmbedColumns } from '@/lib/queries/select-columns'

const POLL_INTERVAL_MS = 3_000
/**
 * Server-side polling gives up ~40s after the response and hands the container
 * to the cron; watching a little longer than that covers the whole deferred
 * window before falling back to "completes automatically".
 */
const WATCH_BUDGET_MS = 60_000

export interface PublishWatchCallbacks {
  /**
   * One destination reached a terminal state. Fired ONCE per destination, as it lands.
   *
   * Networks finish at wildly different speeds — measured, Facebook takes ~7s where an
   * Instagram carousel takes 26-43s — so waiting for the slowest before saying anything left
   * a person watching a spinner for half a minute after half their post was already live.
   */
  onSettled: (platform: string, outcome: 'published' | 'failed', reason: string | null) => void
  /** Every destination settled, however it went. */
  onDone: (summary: { published: string[]; failed: string[] }) => void
  /** The watch window closed with destinations still in flight (the cron takes over). */
  onStillProcessing: (pending: string[]) => void
}

/**
 * How one destination stands, or null while it is still going.
 *
 * A non-final failure re-arms the row to 'scheduled' and KEEPS its message
 * (`markPublicationFailed`), so status alone cannot tell a bounce from a publish that has not
 * started — and to the person who pressed the button a bounce is a failure worth reporting.
 * The error is therefore read before the status, and a destination carrying one is settled
 * whatever its status says.
 */
function outcomeOf(
  publication: PublicationSummary
): { outcome: 'published' | 'failed'; reason: string | null } | null {
  // Checked first so a stale message from an earlier attempt cannot outrank the success that
  // followed it.
  if (publication.status === 'published') return { outcome: 'published', reason: null }
  if (publication.publishError) {
    return { outcome: 'failed', reason: publication.publishError }
  }
  return null
}

/**
 * Poll one post's DESTINATIONS until they settle, within the watch budget.
 *
 * This read `posts.status` for 'published'/'failed' and `posts.publish_error`. Neither survives:
 * the publish path stopped writing `posts`, and that column was dropped. So `status` sat at
 * 'scheduled' throughout a perfectly healthy publish — which read as "the attempt bounced back
 * to the ladder" and reported a false failure three seconds into every deferred publish.
 *
 * It then reported only when EVERY destination had settled, which made one network's failure
 * read as the whole post failing and hid a fast network's success behind a slow one. Each
 * destination is now reported as it lands, once, and `onDone` closes the run.
 */
export function watchPublishOutcome(postId: string, callbacks: PublishWatchCallbacks): void {
  const deadline = Date.now() + WATCH_BUDGET_MS
  /** Reported destinations, so a poll every 3s does not repeat a toast every 3s. */
  const reported = new Map<string, 'published' | 'failed'>()

  function finish(publications: PublicationSummary[]): boolean {
    if (publications.length === 0 || reported.size < publications.length) return false
    const settled = [...reported]
    callbacks.onDone({
      published: settled.filter(([, o]) => o === 'published').map(([platform]) => platform),
      failed: settled.filter(([, o]) => o === 'failed').map(([platform]) => platform),
    })
    return true
  }

  async function check(): Promise<void> {
    let publications: PublicationSummary[] = []
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (res.ok) {
        const { post } = (await res.json()) as {
          post: { post_publications: PublicationEmbedColumns[] | null }
        }
        publications = (post.post_publications ?? []).map(toPublicationSummary)

        for (const publication of publications) {
          if (reported.has(publication.platform)) continue
          const settled = outcomeOf(publication)
          if (!settled) continue
          reported.set(publication.platform, settled.outcome)
          callbacks.onSettled(publication.platform, settled.outcome, settled.reason)
        }

        if (finish(publications)) return
      }
      // Non-ok reads are transient from the watcher's perspective — keep polling.
    } catch {
      // Network hiccup: keep polling until the budget runs out.
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      callbacks.onStillProcessing(
        publications.map((p) => p.platform).filter((platform) => !reported.has(platform))
      )
      return
    }
    setTimeout(() => void check(), POLL_INTERVAL_MS)
  }

  setTimeout(() => void check(), POLL_INTERVAL_MS)
}
