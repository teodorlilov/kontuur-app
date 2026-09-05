-- Two posts sit in the one state the calendar renders nowhere, and nothing stopped them.
--
-- `posts.status` and `posts.scheduled_at` are a PAIR. `statusForSlot` is the only thing that
-- should ever decide them: an instant makes a post 'scheduled', no instant makes it 'approved'.
-- The calendar splits its lanes on exactly that pair — the grid takes
-- `status = 'scheduled' AND scheduled_at IS NOT NULL`, the unscheduled tray takes
-- `status = 'approved' AND scheduled_at IS NULL` — so a row with one and not the other appears in
-- neither, while still being a real post someone is waiting on.
--
-- Found by querying production, not by reading code: 2 of 57 posts are 'scheduled' with a NULL
-- scheduled_at. Their destinations are queued with "No Instagram account connected" and 1-2
-- attempts spent, and the publish cron filters on `posts.scheduled_at` within a window — so a row
-- with no instant can never be selected. They are invisible AND stuck.
--
-- 20260840 could produce this state: it normalised every 'publishing'/'published'/'failed' post to
-- 'scheduled', but only backfilled `scheduled_at` for posts that had a destination with a
-- `published_at`. A post that had failed without ever going out came out the far side 'scheduled'
-- with no instant. That is this migration's own gap, closed here.
--
-- 'approved' is the honest repair, not an invented slot: these posts were never given a time, and
-- 'approved' is precisely "signed off, waiting in the tray for someone to place it".

update posts
set status = 'approved'
where status = 'scheduled'
  and scheduled_at is null;

-- Their destinations go with the slot. `withdrawPendingPublications` does exactly this when a
-- post is unscheduled, for the same reason: a destination with no slot is not waiting for
-- anything. Only rows that have NOT gone out are touched, so this cannot erase a publish.
delete from post_publications pp
using posts p
where pp.post_id = p.id
  and p.status = 'approved'
  and p.scheduled_at is null
  and pp.status = 'scheduled';

-- What `statusForSlot` has always meant, stated where it can be enforced.
--
-- Verified against production before adding: of 57 posts, only the 2 repaired above violated it —
-- no 'approved' post carries an instant, and no draft or pending_review post does either.
-- draft and pending_review are deliberately unconstrained: the create route may store a slot on a
-- post the wizard saved without approving, and that is a real state, not a broken pair.
alter table posts drop constraint if exists posts_slot_matches_status;
alter table posts add constraint posts_slot_matches_status
  check (
    (status = 'scheduled' and scheduled_at is not null)
    or (status = 'approved' and scheduled_at is null)
    or status in ('draft', 'pending_review')
  );
