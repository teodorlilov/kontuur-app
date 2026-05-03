-- Publishing fields on posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS ig_creation_id   TEXT,
  ADD COLUMN IF NOT EXISTS ig_media_id      TEXT,
  ADD COLUMN IF NOT EXISTS publish_error    TEXT,
  ADD COLUMN IF NOT EXISTS publish_attempts INTEGER   DEFAULT 0;

-- Dedicated table for post images (one per carousel slide, or one for single posts)
CREATE TABLE IF NOT EXISTS post_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  public_url    TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  file_name     TEXT,
  file_size     INTEGER,
  content_type  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);
