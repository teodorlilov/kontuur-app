-- Rename misleading column: it stores validation data for ALL post types, not just carousels.
-- ALTER TABLE RENAME COLUMN is metadata-only in PostgreSQL — instant, no table lock.
ALTER TABLE posts RENAME COLUMN carousel_quality_json TO validation_json;
