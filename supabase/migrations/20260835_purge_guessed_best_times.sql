-- ── Remove every posting time a model invented ────────────────────────────────────────────────
--
-- `brand_profiles.best_time_json` had two writers. One reads Instagram's hourly follower-online
-- counts over 28 days and stamps `confidence: 'observed'`; the other asked Haiku to imagine posting
-- times from four profile fields (niche, audience, language, platforms) and stamped
-- 'research-backed' or 'ai-derived' — the model's opinion of its own invention.
--
-- The second writer has been deleted from the application. Deleting it does not remove what it
-- already wrote: a client with no connected Instagram account keeps their guessed row forever,
-- because nothing overwrites it, and the calendar goes on drawing ghost slots from it. Without this
-- statement the change is cosmetic for exactly the clients it was meant to protect.
--
-- Identified by what the observed writer stamps, not by what the model did: it returned values
-- outside its own declared enum before, so anything that is not positively marked as measured is
-- treated as a guess. `coalesce` covers the legacy bare-array rows alongside the
-- `{platforms: [...]}` wrapper both writers used.
--
-- Null means "not measured yet" and the surfaces say so. It is the correct state for these rows:
-- an empty calendar that explains itself is honest, a full one built from a guess is not.
update public.brand_profiles
set best_time_json = null,
    best_time_updated_at = null
where best_time_json is not null
  and (coalesce(best_time_json -> 'platforms', best_time_json) @> '[{"confidence":"observed"}]')
      is not true;

comment on column public.brand_profiles.best_time_json is
  'Observed posting times: hours this client''s Instagram followers were online, averaged over the last 28 days by deriveObservedBestTime and refreshed nightly. Null until an account is connected and enough days are collected. NEVER model-generated — the writer that invented these was removed 2026-08-31.';
