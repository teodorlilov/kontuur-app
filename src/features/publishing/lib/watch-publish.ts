/**
 * Client-side guard for a deferred publish: the dialog closes as soon as the
 * container exists, and this watcher reports the real outcome afterwards — so a
 * failure that lands after the dialog is gone still reaches the user instead of
 * dying silently in a row they are no longer looking at.
 */

import { publishStateOf, toPublicationSummary } from '@/lib/posts/publish-state'
import type { PublicationEmbedColumns } from '@/lib/queries/select-columns'

const POLL_INTERVAL_MS = 3_000
/**
 * Server-side polling gives up ~40s after the response and hands the container
 * to the cron; watching a little longer than that covers the whole deferred
 * window before falling back to "completes automatically".
 */
const WATCH_BUDGET_MS = 60_000

export interface PublishWatchCallbacks {
  onPublished: () => void
  onFailed: (reason: string) => void
  /** The watch window closed while the post was still processing (cron takes over). */
  onStillProcessing: () => void
}

/**
 * Poll one post's DESTINATIONS until they settle, within the watch budget.
 *
 * This read `posts.status` for 'published'/'failed' and `posts.publish_error`. Neither survives:
 * the publish path stopped writing `posts`, and that column was dropped. So `status` sat at
 * 'scheduled' throughout a perfectly healthy publish — which the second test below read as "the
 * attempt bounced back to the ladder" and reported as a failure. Every deferred publish raised a
 * false failure toast three seconds in, whatever actually happened.
 */
export function watchPublishOutcome(postId: string, callbacks: PublishWatchCallbacks): void {
  const deadline = Date.now() + WATCH_BUDGET_MS

  async function check(): Promise<void> {
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (res.ok) {
        const { post } = (await res.json()) as {
          post: { post_publications: PublicationEmbedColumns[] | null }
        }
        const publications = (post.post_publications ?? []).map(toPublicationSummary)
        if (publishStateOf(publications) === 'published') {
          callbacks.onPublished()
          return
        }
        // Any destination carrying an error, whatever its status. A non-final failure re-arms
        // the row to 'scheduled' and keeps the message (markPublicationFailed), so the state
        // alone cannot tell a bounce from a publish that has not started — and for the person
        // who pressed the button a bounce is a failure to report, not a silence. Deliberately
        // not `firstFailureReason`, which answers the calendar's question: what finally killed
        // this destination. Checked after 'published' so a stale message from an earlier
        // attempt cannot outrank the success that followed it.
        const errored = publications.find((publication) => publication.publishError)
        if (errored) {
          callbacks.onFailed(errored.publishError ?? 'Publishing failed')
          return
        }
      }
      // Non-ok reads are transient from the watcher's perspective — keep polling.
    } catch {
      // Network hiccup: keep polling until the budget runs out.
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      callbacks.onStillProcessing()
      return
    }
    setTimeout(() => void check(), POLL_INTERVAL_MS)
  }

  setTimeout(() => void check(), POLL_INTERVAL_MS)
}
