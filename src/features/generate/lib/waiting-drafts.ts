import type { EditorialPost } from '@/lib/posts/fetch-editorial-posts'
import type { WaitingRun } from '@/lib/generation/runs'

/** One run's drafts waiting for review, in the order they were written. */
export interface WaitingDrafts {
  clientId: string
  /** What the run asked for and could not cover. Null when the run itself is gone or never opened. */
  run: WaitingRun | null
  posts: EditorialPost[]
}

/**
 * Group an agency's waiting drafts by the run that wrote them — a review reads one run (its header
 * and every slide strip say which format, and its banner what that run could not cover), so a
 * client with two interrupted runs is offered two groups rather than one mixed list. Groups keep
 * the order of their first draft, so what was written first is offered first.
 *
 * Client and format is the fallback key, and was the only key before the run reached the row: a
 * draft written by a run that could not be opened, or before this column existed, still has to
 * land in a group. It is a guess — two runs of one format merge under it — and the run id is not.
 */
export function groupWaitingDrafts(
  posts: EditorialPost[],
  runs: Map<string, WaitingRun>
): WaitingDrafts[] {
  const groups = new Map<string, WaitingDrafts>()
  for (const item of posts) {
    const runId = item.post.generation_run_id ?? null
    const key = runId ?? `${item.post.client_id}:${item.post.post_type}`
    const group = groups.get(key) ?? {
      clientId: item.post.client_id,
      run: runId ? (runs.get(runId) ?? null) : null,
      posts: [],
    }
    group.posts.push(item)
    groups.set(key, group)
  }
  return [...groups.values()]
}
