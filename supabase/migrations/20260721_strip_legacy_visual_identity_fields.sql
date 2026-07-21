-- Reduce the stored visual identity to the measured palette.
-- The vibe presets + the multimodal vision pass were removed; `VisualIdentity` is now `{ palette }` only,
-- and `ExtractionReport` no longer carries a preset recommendation. The dropped data lives as keys inside
-- the `identity` / `report` jsonb blobs (not columns), so this strips those keys from existing rows.
-- Harmless if already clean (zod strips unknown keys on read); this just stops storing dead data.
-- Idempotent: the WHERE guards make each statement a no-op once the keys are gone.

-- 1. identity blob: drop typography, vibe_preset, and the older brief (mood/subjects/motifs).
update brand_visual_identity
set identity = identity - 'typography' - 'vibe_preset' - 'brief'
where identity ?| array['typography', 'vibe_preset', 'brief'];

update brand_kit_extractions
set identity = identity - 'typography' - 'vibe_preset' - 'brief'
where identity is not null
  and identity ?| array['typography', 'vibe_preset', 'brief'];

-- 2. report blob: drop the preset recommendation (no longer produced or read).
update brand_visual_identity
set report = report - 'presetRecommendation'
where report is not null and report ? 'presetRecommendation';

update brand_kit_extractions
set report = report - 'presetRecommendation'
where report is not null and report ? 'presetRecommendation';

-- 3. report.confidence: keep only the fields still extracted (colors, accent); drop the rest.
update brand_visual_identity
set report = jsonb_set(
  report,
  '{confidence}',
  (report -> 'confidence') - 'mood' - 'subjects' - 'preset' - 'fonts' - 'typeScale'
)
where report is not null
  and report -> 'confidence' is not null
  and (report -> 'confidence') ?| array['mood', 'subjects', 'preset', 'fonts', 'typeScale'];

update brand_kit_extractions
set report = jsonb_set(
  report,
  '{confidence}',
  (report -> 'confidence') - 'mood' - 'subjects' - 'preset' - 'fonts' - 'typeScale'
)
where report is not null
  and report -> 'confidence' is not null
  and (report -> 'confidence') ?| array['mood', 'subjects', 'preset', 'fonts', 'typeScale'];
