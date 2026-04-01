-- Run this in the Supabase SQL editor to add the client_sources table.
-- This table stores per-client research sources (RSS feeds and website URLs)
-- that are fetched during the research step to ground theme suggestions in real content.

CREATE TABLE client_sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('rss', 'website', 'file')),
  label              text NOT NULL,
  url                text NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  -- Updated on each research trigger (fire-and-forget)
  last_fetched_at    timestamptz,
  last_fetch_status  text,            -- 'ok' | 'error' | 'timeout'
  last_fetch_error   text,
  -- Per-source config: { "max_items": 4 } for RSS, etc.
  config             jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_sources_client_id ON client_sources(client_id);
CREATE INDEX idx_client_sources_active    ON client_sources(client_id, is_active);

-- Enable RLS
ALTER TABLE client_sources ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can access sources for clients in their agency
CREATE POLICY "Users can manage their agency's client sources"
ON client_sources
FOR ALL
USING (
  client_id IN (
    SELECT c.id FROM clients c
    INNER JOIN users u ON u.agency_id = c.agency_id
    WHERE u.id = auth.uid()
  )
)
WITH CHECK (
  client_id IN (
    SELECT c.id FROM clients c
    INNER JOIN users u ON u.agency_id = c.agency_id
    WHERE u.id = auth.uid()
  )
);
