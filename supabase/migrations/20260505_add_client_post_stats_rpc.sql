-- Aggregates post stats per client for an agency in a single DB round-trip.
-- Replaces the previous approach of fetching all rows and aggregating in JS.
CREATE OR REPLACE FUNCTION client_post_stats(p_agency_id uuid)
RETURNS TABLE(
  client_id uuid,
  published_count bigint,
  total_count bigint,
  last_generated_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    p.client_id,
    COUNT(*) FILTER (WHERE p.status = 'published'),
    COUNT(*),
    MAX(p.created_at)
  FROM posts p
  JOIN clients c ON c.id = p.client_id
  WHERE c.agency_id = p_agency_id
  GROUP BY p.client_id;
$$;
