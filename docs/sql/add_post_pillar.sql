-- Add content pillar tracking to posts
-- Each post can be tagged with the content pillar it covers
ALTER TABLE posts ADD COLUMN pillar text DEFAULT null;
