-- Generation stops choosing a network.
--
-- `posts.platform` recorded what a post was WRITTEN FOR: the wizard picked one per run, the
-- client's weekly mix stored one, and the autonomous cron read it back. That made the network
-- an authoring decision, taken before anyone knew where the post would go.
--
-- It is a publishing decision now. Content is written once, to the tighter of the platforms'
-- limits so it is valid on either, and where it goes is chosen when it is scheduled — recorded
-- on `post_publications`, one row per destination. A post can reach two networks, which is a
-- sentence this column could never express.
--
-- The check constraint goes with it: it existed to keep this column spelling platforms the same
-- way `PLATFORMS` does, and there is no column left to constrain.

alter table posts drop constraint if exists posts_platform_canonical;
alter table posts drop column if exists platform;

-- The platform key inside every client's weekly mix, which the generate cron read to decide
-- what to write for. The format shares (`carousel`, `single`) stay — those are still a real
-- instruction about what to make, just not about where it goes.
update brand_profiles
set weekly_mix_json = (
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(weekly_mix_json::jsonb)
  where key in ('carousel', 'single')
)
where weekly_mix_json is not null;

-- Three more columns recorded the same authoring decision from further away.
--
-- `generation_runs.platform` was the network a batch was written for — the wizard's chip or
-- the client's weekly mix. Nothing reads it, and a run no longer has one answer to give.
alter table generation_runs drop column if exists platform;

-- `discarded_drafts.platform` was copied off the post being thrown away, as provenance for
-- the per-source usefulness stats. Its source is gone, so every future row would record null;
-- a column that can only be empty is worse than no column, because a reader cannot tell the
-- two apart.
alter table discarded_drafts drop column if exists platform;

-- The client's own request, taken through the public idea form: "post this on Instagram".
-- It rode into generation on the brief that idea became, and briefs no longer carry one.
-- Keeping it would store a preference nothing can act on.
alter table client_ideas drop column if exists platform;
