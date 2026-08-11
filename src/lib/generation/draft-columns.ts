import type { Json, PostRow } from '@/types'

/**
 * The columns a generated draft carries into `posts`, however it gets there.
 *
 * Two callers write a draft: the generate cron inserts it directly, and the review
 * flow POSTs it to `/api/posts` on approval. Both enumerated these fourteen columns
 * by hand and had already drifted — the cron omitted the `?? null` coalescing the
 * other applied, so a draft with an undefined provenance field wrote differently
 * depending on which path saved it.
 *
 * What each caller still owns is the part that genuinely differs: `status`
 * (`pending_review` from the cron, `approved`/`scheduled` on approval), `priority`,
 * scheduling, and rewrite bookkeeping. Those are decisions about the post's place in
 * the workflow, not facts about the draft.
 *
 * Structural rather than tied to `DraftPost`, because the two callers hold the draft
 * at different points in its life — the cron has the freshly generated record, the
 * review flow a `PostData` the reviewer has been editing.
 */
export type DraftColumnSource = Pick<
  PostRow,
  'client_id' | 'caption' | 'platform' | 'post_type' | 'quality_score_avg'
> & {
  /** Carried un-narrowed, the same way PostData does — the column is structurally Json. */
  slides_json: unknown
  validation_json: unknown
} & Partial<
    Pick<
      PostRow,
      | 'topic_summary'
      | 'source_url'
      | 'source_title'
      | 'source_type'
      | 'source_excerpt'
      | 'client_source_id'
      | 'pillar'
    >
  >

export function draftColumns(post: DraftColumnSource) {
  return {
    client_id: post.client_id,
    caption: post.caption,
    platform: post.platform,
    post_type: post.post_type,
    // WHY as: the read side types both columns `unknown` on purpose — each surface
    // parses them into its own shape rather than trusting the column — but a write
    // needs the column's actual type. This is the one place a draft becomes a write,
    // so the narrowing happens once here instead of at every caller. It replaces a
    // blanket `as posts['Insert']` on the whole row, which suppressed type checking
    // for all fourteen columns rather than these two.
    slides_json: (post.slides_json ?? null) as Json,
    validation_json: (post.validation_json ?? null) as Json,
    quality_score_avg: post.quality_score_avg,
    topic_summary: post.topic_summary ?? null,
    source_url: post.source_url ?? null,
    source_title: post.source_title ?? null,
    source_type: post.source_type ?? null,
    source_excerpt: post.source_excerpt ?? null,
    client_source_id: post.client_source_id ?? null,
    pillar: post.pillar ?? null,
  }
}
