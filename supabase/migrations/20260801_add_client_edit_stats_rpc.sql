-- Aggregates the client settings page's post counts into one round trip.
--
-- The page issued five separate head:true counts against posts for the same client, differing only
-- by status filter. Each was cheap on its own — idx_posts_client_id_status covers them all — so the
-- cost was five round trips, not five slow queries. One aggregate over that same index replaces
-- them, which is why 20260731_drop_client_post_stats_rpc.sql deliberately kept the index when it
-- dropped its own orphaned aggregate.
--
-- No agency argument: the caller verifies client ownership before reaching this, and adding a
-- clients join here would cost a join per call to re-check something already established.
CREATE OR REPLACE FUNCTION client_edit_stats(p_client_id uuid)
RETURNS TABLE(
  pending_count bigint,
  published_count bigint,
  scheduled_count bigint,
  approved_unpublished_count bigint,
  last_generated_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending_review'),
    COUNT(*) FILTER (WHERE status = 'published'),
    -- There is no 'scheduled' status: a scheduled post is approved with a scheduled_at.
    COUNT(*) FILTER (WHERE status = 'approved' AND scheduled_at IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'approved' AND published_at IS NULL),
    MAX(created_at)
  FROM posts
  WHERE client_id = p_client_id;
$$;
