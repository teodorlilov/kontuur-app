-- Guarantee one image per (post_id, position).
-- Replace-at-position is delete-then-insert with no DB constraint, so two overlapping
-- generations/uploads for the same slot could both insert — and publishing would push both,
-- since the scheduler just orders by position. This makes the race a clean insert error instead.
-- Idempotent: the dedupe is a no-op once clean; the index is IF NOT EXISTS.

-- 1. Dedupe any existing rows, keeping the newest per (post_id, position).
--    (Orphaned storage files for removed dupes are accepted — rows are the source of truth.)
with ranked as (
  select id,
         row_number() over (
           partition by post_id, position
           order by created_at desc nulls last, id desc
         ) as rn
  from post_images
)
delete from post_images
where id in (select id from ranked where rn > 1);

-- 2. Enforce uniqueness going forward.
create unique index if not exists uq_post_images_post_position
  on post_images (post_id, position);
