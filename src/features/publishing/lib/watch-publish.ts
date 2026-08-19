/**
 * Client-side guard for a deferred publish: the dialog closes as soon as the
 * container exists, and this watcher reports the real outcome afterwards — so a
 * failure that lands after the dialog is gone still reaches the user instead of
 * dying silently in a row they are no longer looking at.
 */

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

/** Poll one post's status until it leaves 'publishing', within the watch budget. */
export function watchPublishOutcome(postId: string, callbacks: PublishWatchCallbacks): void {
  const deadline = Date.now() + WATCH_BUDGET_MS

  async function check(): Promise<void> {
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (res.ok) {
        const { post } = (await res.json()) as {
          post: { status: string; publish_error: string | null }
        }
        if (post.status === 'published') {
          callbacks.onPublished()
          return
        }
        if (post.status === 'failed' || post.status === 'scheduled') {
          // 'scheduled' here means the attempt failed and went back to the
          // retry ladder — for the person who pressed the button, that is a
          // failure to report, not a silence.
          callbacks.onFailed(post.publish_error ?? 'Publishing failed')
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
