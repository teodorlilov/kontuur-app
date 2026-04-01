-- Add source_type column to posts table to track where content originated
ALTER TABLE posts
  ADD COLUMN source_type TEXT DEFAULT NULL;
