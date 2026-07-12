-- The art-direction brief (photographic subjects, motifs, mood) inferred at extraction.
-- Persisted so image generation (Phase 4) can prompt from it; the extractor already computes it
-- (vision.ts) but saveBrandKit previously discarded it. jsonb shape: { photographicSubjects, motifs, mood }.
alter table brand_kits add column if not exists brief jsonb;
