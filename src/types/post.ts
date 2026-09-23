import type { PostRow } from '@/types'

/**
 * A post reduced to when it publishes — the shape behind UPCOMING_POST_COLUMNS, read by
 * the clients roster and both dashboard publish lists. Derived from the generated row type
 * rather than restated, so a column that changes nullability fails the build instead of
 * drifting silently.
 */
export type PostSummary = Pick<PostRow, 'id' | 'client_id' | 'scheduled_at'>

/**
 * A post as the wizard and review surfaces carry it.
 *
 * Derived from the generated row type: a column that changes shape fails the build
 * here rather than drifting. The `Partial` half is the tail every surface may omit —
 * attribution, publish bookkeeping, and what a draft remembers of the run that made it
 * (the date its brief asked for, the idea that asked, the run it belongs to).
 */
export type PostData = Pick<
  PostRow,
  | 'id'
  | 'client_id'
  | 'caption'
  | 'post_type'
  | 'status'
  | 'priority'
  | 'quality_score_avg'
  | 'created_at'
> & {
  /** Carried un-narrowed: each surface parses these into its own shape
   *  (CarouselSlide[], ValidationData) rather than trusting the column. */
  slides_json: unknown
  validation_json: unknown
} & Partial<
    Pick<
      PostRow,
      | 'topic_summary'
      | 'was_rewritten'
      | 'rewrite_count'
      | 'source_url'
      | 'source_title'
      | 'source_type'
      | 'pillar'
      | 'source_excerpt'
      | 'client_source_id'
      | 'target_date'
      | 'client_idea_id'
      | 'generation_run_id'
    >
  >
