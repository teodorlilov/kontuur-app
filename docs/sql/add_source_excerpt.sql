-- Add source_excerpt column to posts table
-- Stores the source context (trend description or source excerpt) for each post
ALTER TABLE posts ADD COLUMN source_excerpt text DEFAULT null;
