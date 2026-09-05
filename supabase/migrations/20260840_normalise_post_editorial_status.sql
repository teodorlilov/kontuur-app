-- The half of 20260838 that was missed: `posts.status` still holds publish states.
--
-- 20260838 copied `p.status` into `post_publications.status` and dropped the publish columns,
-- but it never rewrote the column it copied FROM. So production still carries posts with
-- status 'publishing', 'published' and 'failed' — values the app has since removed from
-- POST_STATUSES, on a column with no check constraint to have caught it.
--
-- That is not cosmetic. Every list that was narrowed to the editorial lifecycle now filters
-- those rows out: the calendar's query takes ('approved','scheduled') and its grid takes
-- 'scheduled', so EVERY POST EVER PUBLISHED disappears from the calendar. Before this change
-- both lists named the publish states explicitly, which is what kept those rows visible.
--
-- 'scheduled' is what they all become, because that is where the editorial lifecycle ends and
-- exactly what a post published today looks like: the content was signed off and given a slot,
-- and whether it went out is its publications' answer, not this column's.
--
-- BEFORE APPLYING, confirm nothing else is hiding in there — the constraint at the end will
-- reject it, and you want to know now rather than mid-deploy:
--   select status, count(*) from posts group by status order by 2 desc;

-- First, so the rows can still be identified by the status about to be rewritten.
--
-- A post published on demand never had a slot: `posts.published_at` used to record when it went
-- out, and it is gone. The destination's own moment is the honest replacement — without it these
-- rows would come out of this migration as 'scheduled' with a null scheduled_at, which is the one
-- pair the calendar shows nowhere. The publish-now route stamps the same pair going forward.
update posts p
set scheduled_at = pub.published_at
from (
  select post_id, min(published_at) as published_at
  from post_publications
  where published_at is not null
  group by post_id
) pub
where pub.post_id = p.id
  and p.scheduled_at is null
  and p.status in ('publishing', 'published', 'failed');

update posts
set status = 'scheduled'
where status in ('publishing', 'published', 'failed');

-- What the app has believed since the lifecycles were split, now stated where it can be enforced.
-- `post_publications.status` deliberately carries no such constraint (20260838 leaves that to the
-- app); this column is different — it is the one two lifecycles were confused on, and the drift
-- above went unnoticed precisely because nothing checked it.
alter table posts drop constraint if exists posts_status_editorial;
alter table posts add constraint posts_status_editorial
  check (status in ('draft', 'pending_review', 'approved', 'scheduled'));
