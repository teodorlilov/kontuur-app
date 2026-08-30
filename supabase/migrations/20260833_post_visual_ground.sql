-- ── One ground colour per post, and three columns nothing has read in a year ──────────────────
--
-- The colour PAIR a post's art is built on. Stored rather than re-derived per slide because the
-- ladder it comes from is derived live from the brand palette — so the moment someone edits that
-- palette, a slide regenerated afterwards would come back a different colour from the siblings
-- generated before it. Persisting makes the post's colours a fact about the post rather than a
-- function of settings that change underneath it.
--
-- Null means "not yet chosen": the first slide of a post to generate picks one and writes it, and
-- every later slide and every regenerate reads it back. Posts that predate this stay null and get
-- a ground the first time they generate anything.
alter table public.posts
  add column if not exists visual_ground text,
  add column if not exists visual_accent text;

comment on column public.posts.visual_ground is
  'Ground colour (#rrggbb) of the scheme this post''s AI visuals are built on. Chosen once from the tonal ladder derived from the client''s palette, then read back by every slide and regenerate so a carousel cannot desynchronise.';
comment on column public.posts.visual_accent is
  'Accent colour (#rrggbb) paired with visual_ground. How the pair is used is the brand style''s decision: a flat backdrop, printed ink, or a tint in the lighting.';

-- ── Dead since the composition-engine pivot ───────────────────────────────────────────────────
--
-- All three appear in exactly one place in the repository: the baseline statement that created
-- them. No application code reads or writes any of them — they are leftovers from the retired
-- brand-kit/design-json era, and leaving them in place means the next person to read this schema
-- spends the same afternoon proving they are unused.
alter table public.posts
  drop column if exists design_json,
  drop column if exists design_overrides,
  drop column if exists brand_kit_version;
