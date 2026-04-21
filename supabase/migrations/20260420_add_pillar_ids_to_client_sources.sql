-- Add pillar_ids column to client_sources
ALTER TABLE client_sources
ADD COLUMN pillar_ids jsonb NOT NULL DEFAULT '[]';

-- Allow 'tavily' as a source type
ALTER TABLE client_sources DROP CONSTRAINT IF EXISTS client_sources_type_check;
ALTER TABLE client_sources ADD CONSTRAINT client_sources_type_check
  CHECK (type IN ('rss', 'website', 'file', 'tavily'));

-- Backfill stable IDs into existing content_pillars JSON
UPDATE brand_profiles
SET content_pillars = (
  SELECT json_agg(
    CASE WHEN elem->>'id' IS NULL
    THEN json_build_object(
      'id', gen_random_uuid()::text,
      'pillar', elem->>'pillar',
      'weight', (elem->>'weight')::int,
      'allowed_sources', elem->'allowed_sources'
    )
    ELSE elem
    END
  )::text
  FROM json_array_elements(content_pillars::json) elem
)
WHERE content_pillars IS NOT NULL
  AND content_pillars != ''
  AND content_pillars != '[]';
