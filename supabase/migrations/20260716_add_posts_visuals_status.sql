-- Tracks the on-demand visual-generation job for a post so the review can poll it.
-- `post_visuals` holds the output (one composition per slide); this is the overall job state.
-- null = never generated; 'generating' | 'ready' | 'failed'. (Phase 4 imagery runs inside the same job.)
alter table posts add column if not exists visuals_status text;
alter table posts add column if not exists visuals_error text;
