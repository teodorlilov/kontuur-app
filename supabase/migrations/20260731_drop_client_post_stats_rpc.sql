-- client_post_stats was called from exactly one place, getCachedClientPostStats,
-- which the Clients roster replaced. The roster derives its own counts from the
-- rows it already loads, so the aggregate no longer runs on any route.
--
-- Safe and reversible: a STABLE pure function holds no data, and the original
-- definition is in 20260505_add_client_post_stats_rpc.sql.
DROP FUNCTION IF EXISTS client_post_stats(uuid);

-- idx_posts_client_id_status is deliberately KEPT. Its comment names the RPC,
-- but it also serves every per-client post query — including the roster's own
-- upcoming-posts lookup, which extends it in 20260731_add_roster_indexes.sql.
