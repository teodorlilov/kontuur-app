-- What a post should get someone to do — the client's social goal.
--
-- This field has existed in the product since onboarding shipped: the profile
-- generator returns `social_goals`, and the onboarding review step renders it as
-- an editable section. It has never had a column. `handleSave` does not send it,
-- so every value a user typed there has been discarded on save, silently, from
-- the beginning.
--
-- The rebuilt onboarding makes it the one question the website read cannot
-- answer — nothing on a site states what a post should make someone do — so it
-- is the flagship "needs your call" row rather than a field to quietly default.
-- That only works if the answer is kept.
--
-- `text`, not `text[]`: target_audience is the sibling field of the same shape
-- (a short list the user edits as one line) and is stored comma-joined. Two
-- storage conventions for the same kind of value would be drift.
--
-- APPLY THIS FIRST, before the code that ships with it. `BRAND_PROFILE_COLUMNS`
-- in src/lib/queries/select-columns.ts now names social_goals, and that string
-- is what fetchBrandProfileByClient selects — so generation, the cron run and
-- client settings all fail on a database without this column. Release order for
-- the pair of 20260803 migrations is: this one, then the deploy, then the
-- testimonial-voice drop.
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS social_goals text;

COMMENT ON COLUMN brand_profiles.social_goals IS
  'What a post should get someone to do. Comma-separated, matching target_audience.';
