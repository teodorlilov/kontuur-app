-- Indexes for the Clients roster (/clients).

-- Postgres indexes a foreign key's *referenced* primary key, never the
-- referencing column, so clients.agency_id has been unindexed since day one.
-- Every agency-scoped client read is a sequential scan — the roster,
-- getCachedAgencyClients, and the clients join inside client_post_stats alike.
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);

-- The roster's approvals query joins post_approval_tokens to posts on post_id,
-- which was likewise unindexed.
CREATE INDEX IF NOT EXISTS idx_post_approval_tokens_post_id ON post_approval_tokens(post_id);

-- Extends idx_posts_client_id_status by one column so the roster's
-- next-scheduled-post query serves its scheduled_at range filter AND its
-- ORDER BY from the index, instead of filtering in the heap and sorting after.
CREATE INDEX IF NOT EXISTS idx_posts_client_status_scheduled
  ON posts(client_id, status, scheduled_at);
