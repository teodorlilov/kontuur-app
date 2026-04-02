-- Add batch_id column to group approval token rows into batches
ALTER TABLE post_approval_tokens ADD COLUMN batch_id uuid;

-- Index for fast batch lookups
CREATE INDEX idx_post_approval_tokens_batch_id ON post_approval_tokens (batch_id);
