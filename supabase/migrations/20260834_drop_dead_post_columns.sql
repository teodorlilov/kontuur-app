-- ── Two more columns nothing has read ─────────────────────────────────────────────────────────
--
-- `image_url` predates `post_images`. Every post's images live in that table, one row per carousel
-- position, and this single-valued column could never have described a carousel. It is null on all
-- 46 rows in production, no code writes it, and the one place it is named in the app is a `Pick`
-- that explicitly EXCLUDES it (features/review/lib/queue-post.ts). It was nonetheless in
-- POST_COLUMN_KEYS, so every post read in the dashboard fetched it.
--
-- `format` holds the string 'portrait' on every row and is read by nothing. The canvas is fixed at
-- 1080×1350 in code (lib/canvas/constants.ts), and Instagram's 4:5 floor is enforced at the fal
-- image size — a column that has one value and no reader is not a setting, it is a comment.
--
-- Both verified empty/constant against production before dropping.
alter table public.posts
  drop column if exists image_url,
  drop column if exists format;
