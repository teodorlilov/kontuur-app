-- Rebuild the (batch_id, created_at) composite that was never actually created.
--
-- 20260505_add_performance_indexes.sql intended a (batch_id, created_at)
-- composite, but 20260402_add_batch_id_to_approval_tokens.sql had already
-- created an index of the same name on (batch_id) alone. IF NOT EXISTS matched
-- on the NAME, not the definition, so the 20260505 statement has been a silent
-- no-op ever since and the composite was never built.
--
-- Rebuilt under a distinct name so the same collision cannot recur. Split out
-- of 20260731_add_roster_indexes.sql: it predates the roster and should be
-- revertable on its own.
--
-- The dashboard's fetchBatchPositions() orders tokens by created_at within a
-- batch, which is exactly what this serves.
DROP INDEX IF EXISTS idx_post_approval_tokens_batch_id;
CREATE INDEX IF NOT EXISTS idx_post_approval_tokens_batch_created
  ON post_approval_tokens(batch_id, created_at);
