-- AI art director: the per-brand art-direction spec, composed at onboarding review from the visual
-- identity + business context. It drives layout / treatment / image-model selection for every later post.
-- Nullable — older kits and the default kit have none, so `resolveArtDirection` falls back to
-- DEFAULT_ART_DIRECTION. Idempotent.

alter table brand_kits add column if not exists art_direction jsonb;
