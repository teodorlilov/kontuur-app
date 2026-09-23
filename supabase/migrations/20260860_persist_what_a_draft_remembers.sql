-- What a draft knew while it was in the browser, and forgot when it became a row.
--
-- A wizard draft is a `posts` row from the moment it streams (20260840 status, 20260859 claims), so
-- a person can leave and come back to it. Three facts did not survive that round trip, and each one
-- costs the person something:
--
--   * the date a priority brief asked for — the schedule dialog pre-selects it during the run and
--     opened blank on a resume, so a client's "before the 12th" could be missed;
--   * the idea the run came from — the link is made on the FIRST approval, and a resumed flow no
--     longer knew which idea, so the request sat in the Inbox looking untouched and invited a
--     second paid run of the same thing;
--   * the run itself — the drafts of one run could only be re-grouped by guessing
--     (client + post type), and the run's own outcome had nowhere to live.
--
-- All three are facts about the draft, so they belong on the draft. `on delete set null` on both
-- references: an idea outlives the post it produced (20260817 chose the same rule for the reverse
-- link) and a draft outlives the bookkeeping of the run that made it.
alter table public.posts
  add column if not exists target_date date,
  add column if not exists client_idea_id uuid references public.client_ideas(id) on delete set null,
  add column if not exists generation_run_id uuid references public.generation_runs(id) on delete set null;

comment on column public.posts.target_date is
  'The date a priority brief asked this post to go out. A request, not a schedule: scheduled_at is the decision.';
comment on column public.posts.client_idea_id is
  'The client idea whose brief started the run that produced this draft. Read at approve, where the first approved draft of the run marks the idea generated.';
comment on column public.posts.generation_run_id is
  'The generation run that produced this draft — what makes a set of waiting drafts one run rather than a guess about client and format.';

-- The resume reads a client's waiting drafts and groups them by run.
create index if not exists idx_posts_generation_run_id
  on public.posts using btree (generation_run_id);

-- What the run could not tell anyone afterwards: which content pillars research found nothing for,
-- and what that cost the batch. Both numbers already exist at run time — the orchestrator computes
-- them and streams them to the browser, which shows a banner and then forgets. Written once, when
-- the run is closed.
alter table public.generation_runs
  add column if not exists skipped_pillars jsonb;

comment on column public.generation_runs.skipped_pillars is
  'What research could not cover: { names: string[], cost: number } — the pillar names and how many posts their absence cost this run.';

notify pgrst, 'reload schema';
