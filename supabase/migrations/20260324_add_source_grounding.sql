-- Add source attribution columns to posts table
ALTER TABLE posts
  ADD COLUMN source_url TEXT DEFAULT NULL,
  ADD COLUMN source_title TEXT DEFAULT NULL;

-- Index for querying posts that have source attribution
CREATE INDEX idx_posts_source_url ON posts (source_url) WHERE source_url IS NOT NULL;
