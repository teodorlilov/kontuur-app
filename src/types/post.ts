import type { PostRow } from '@/types'

/**
 * A post reduced to when and where it publishes — the shape behind
 * UPCOMING_POST_COLUMNS, read by the clients roster and both dashboard publish
 * lists. Derived from the generated row type rather than restated, so a column
 * that changes nullability fails the build instead of drifting silently.
 */
export type PostSummary = Pick<PostRow, 'id' | 'client_id' | 'platform' | 'scheduled_at'>

/**
 * A post as the wizard and review surfaces carry it.
 *
 * Derived from the generated row type: a column that changes shape fails the build
 * here rather than drifting. The `Partial` half is the tail every surface may omit —
 * attribution and publish bookkeeping that only some reads project.
 */
export type PostData = Pick<
  PostRow,
  | 'id'
  | 'client_id'
  | 'caption'
  | 'platform'
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
  /**
   * The date a priority brief asked for. Present only on wizard drafts, which are
   * not rows yet — there is no `posts.target_date`, and nothing persists it. It
   * exists so the schedule dialog can default to what the client asked for.
   */
  target_date?: string | null
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
      | 'ig_creation_id'
      | 'ig_media_id'
      | 'publish_error'
      | 'publish_attempts'
    >
  >
