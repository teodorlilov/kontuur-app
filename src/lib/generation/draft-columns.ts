import type { Json, PostRow } from '@/types'

/**
 * The columns a generated draft carries into `posts` — the facts about the draft, read by the
 * one insert (`insertDraftPosts`, lib/generation/draft-posts.ts). What that writer's callers
 * still own is the part that genuinely differs: `status` (`'draft'` from the wizard stream,
 * `'pending_review'` from the cron and a duplicate), `priority`, and the colour pair — decisions
 * about the post's place in the workflow, not facts about the draft.
 *
 * Structural rather than tied to `DraftPost`, because the callers hold the draft at different
 * points in its life — the stream and the cron have the freshly generated record, a duplicate
 * the projection of a row that already published.
 */
export type DraftColumnSource = Pick<
  PostRow,
  'client_id' | 'caption' | 'post_type' | 'quality_score_avg'
> & {
  /** Carried un-narrowed, the same way PostData does — the column is structurally Json. */
  slides_json: unknown
  validation_json: unknown
  generated_slides_json?: unknown
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
      | 'generated_caption'
      | 'target_date'
    >
  >

/**
 * One draft's `posts` columns, as `DraftColumnSource` describes them. `generated_caption` is the
 * AI's own text, the baseline the learning loop diffs edits against; it falls back to the caption
 * only when absent, so a duplicate of an edited post does not file the reviewer's edit as the
 * AI's. `target_date` is what the brief asked for; `scheduled_at` is the decision and is not
 * written here.
 *
 * WHY as: the read side types the slide and validation columns `unknown` so each surface parses
 * its own shape (`PostData`, src/types/post.ts), while the write needs `Json` — narrowed here per
 * column rather than as a cast on the whole row.
 */
export function draftColumns(post: DraftColumnSource) {
  return {
    client_id: post.client_id,
    caption: post.caption,
    post_type: post.post_type,
    slides_json: (post.slides_json ?? null) as Json,
    validation_json: (post.validation_json ?? null) as Json,
    generated_caption: post.generated_caption ?? post.caption,
    generated_slides_json: (post.generated_slides_json ?? post.slides_json ?? null) as Json,
    quality_score_avg: post.quality_score_avg,
    topic_summary: post.topic_summary ?? null,
    source_url: post.source_url ?? null,
    source_title: post.source_title ?? null,
    source_type: post.source_type ?? null,
    source_excerpt: post.source_excerpt ?? null,
    client_source_id: post.client_source_id ?? null,
    pillar: post.pillar ?? null,
    target_date: post.target_date ?? null,
  }
}
