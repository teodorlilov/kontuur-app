-- Performance indexes for cold-load queries

-- Speeds up pending_review lookups (layout, clients page, edit page)
CREATE INDEX IF NOT EXISTS idx_posts_status_client_id ON posts(status, client_id);

-- Speeds up client_post_stats RPC and any per-client post queries
CREATE INDEX IF NOT EXISTS idx_posts_client_id_status ON posts(client_id, status);

-- Speeds up pillar aggregation on edit page
CREATE INDEX IF NOT EXISTS idx_posts_client_id_pillar ON posts(client_id, pillar) WHERE pillar IS NOT NULL;

-- Speeds up new ideas count (sidebar badge)
CREATE INDEX IF NOT EXISTS idx_client_ideas_agency_status ON client_ideas(agency_id, status);

-- Speeds up batch position computation (dashboard)
CREATE INDEX IF NOT EXISTS idx_post_approval_tokens_batch_id ON post_approval_tokens(batch_id, created_at);
