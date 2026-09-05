-- `client_edit_stats` still speaks the pre-split vocabulary, and one of its columns is gone.
--
-- 20260838 moved the publish lifecycle onto `post_publications` and dropped `posts.published_at`.
-- This function was written before that and never revisited, so calling it now fails outright with
-- `column "published_at" does not exist` — the client settings page catches the error and renders
-- four zeros, which reads as a client with no posts rather than as a broken query.
--
-- A migration that drops a column has to carry every reader with it, and a function body is a
-- reader that no TypeScript gate can see: `npm run check` is green, the types are regenerated, and
-- this was still broken. It is the only stale one — `client_post_stats` was dropped in 20260731,
-- and the two image-credit functions do not touch posts.
--
-- Three things change, not one:
--
--   published_count   asks the destinations. There is no `published` status on `posts` any more,
--                     so the old FILTER matched nothing even before the dropped column errored.
--                     A post counts as published when ANY destination went out — the same rule
--                     `publishStateOf` applies in the app.
--
--   scheduled_count   was `status = 'approved' AND scheduled_at IS NOT NULL`, under a comment
--                     saying "there is no 'scheduled' status". There is one now: `statusForSlot`
--                     gives a post with a slot exactly that status. Published posts are excluded,
--                     because `posts.status` stays 'scheduled' for the whole of a post's published
--                     life — without the exclusion this figure would count posts already out and
--                     never fall as the week emptied.
--
--   approved_unpublished_count  is now simply `status = 'approved'`. The two statuses used to
--                     overlap — a scheduled post WAS an approved post with an instant — so this
--                     had to say "and not published" to mean anything. They are disjoint now:
--                     'approved' is signed off with no slot, which is what the rail's
--                     "Approved, unpublished" has always meant to say.
CREATE OR REPLACE FUNCTION client_edit_stats(p_client_id uuid)
RETURNS TABLE(
  pending_count bigint,
  published_count bigint,
  scheduled_count bigint,
  approved_unpublished_count bigint,
  last_generated_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*) FILTER (WHERE p.status = 'pending_review'),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM post_publications pp
      WHERE pp.post_id = p.id AND pp.status = 'published'
    )),
    COUNT(*) FILTER (WHERE p.status = 'scheduled' AND NOT EXISTS (
      SELECT 1 FROM post_publications pp
      WHERE pp.post_id = p.id AND pp.status = 'published'
    )),
    COUNT(*) FILTER (WHERE p.status = 'approved'),
    MAX(p.created_at)
  FROM posts p
  WHERE p.client_id = p_client_id;
$$;
