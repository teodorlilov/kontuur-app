-- Extend source system: source strategy, file uploads
-- Run after add_client_sources.sql

-- Source strategy on brand_profiles (controls which source types are used per client)
ALTER TABLE brand_profiles ADD COLUMN source_strategy jsonb NOT NULL
  DEFAULT '{"rss": true, "website": true, "file": true, "trend_fallback": true}';

-- File support on client_sources (stores uploaded document path and extracted text)
ALTER TABLE client_sources ADD COLUMN file_path text DEFAULT NULL;
ALTER TABLE client_sources ADD COLUMN extracted_text text DEFAULT NULL;

-- NOTE: Also create Supabase Storage bucket manually in Dashboard:
--   Name: client-files
--   Public: false
--   File size limit: 10MB
--   Allowed MIME types: application/pdf, text/plain
-- No RLS policy needed — uploads go through API route using admin client (service role key).
