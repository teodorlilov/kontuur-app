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

export function draftColumns(post: DraftColumnSource) {
  return {
    client_id: post.client_id,
    caption: post.caption,
    post_type: post.post_type,
    // WHY as: the read side types both columns `unknown` on purpose — each surface
    // parses them into its own shape rather than trusting the column — but a write
    // needs the column's actual type. This is the one place a draft becomes a write,
    // so the narrowing happens once here instead of at every caller. It replaces a
    // blanket `as posts['Insert']` on the whole row, which suppressed type checking
    // for every column rather than these two.
    slides_json: (post.slides_json ?? null) as Json,
    validation_json: (post.validation_json ?? null) as Json,
    // The AI's own text, kept for the edit-diff the learning loop reads. Coalesced so a
    // duplicate of an edited post keeps the ORIGINAL's baseline rather than restating the
    // reviewer's edit as the AI's — the divergence being captured would vanish.
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
    // What the brief asked for, not what anyone decided: `scheduled_at` is the decision, and this
    // is what the schedule dialog offers first when the draft is read back days later.
    target_date: post.target_date ?? null,
  }
}
