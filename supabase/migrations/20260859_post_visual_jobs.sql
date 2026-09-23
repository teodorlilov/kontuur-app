-- A picture being made, while it is being made.
--
-- Generating one slide's visual takes ~52s and leaves no trace until it lands as a `post_images`
-- row. Anything deciding "which positions still owe a picture" — the generate flow resuming a run
-- it left, a second tab, the visuals cron beside a person pressing Regenerate — reads the images
-- and therefore asks for the SAME position again: two paid generations, one surviving picture, the
-- first one's file deleted by the second's upsert.
--
-- One row per position being worked on, taken before the model is called and dropped when it is
-- done. `started_at` is what makes it safe: a serverless invocation killed mid-generation cannot
-- delete its own row, so a claim older than the window (lib/visual/visual-jobs.ts) is treated as
-- abandoned and may be taken over. Service-role only, like `discarded_drafts`: nothing a browser
-- reads directly, and the claim must not be forgeable.
create table if not exists public.post_visual_jobs (
  post_id uuid not null references public.posts(id) on delete cascade,
  position integer not null,
  started_at timestamptz not null default now(),
  primary key (post_id, position)
);

alter table public.post_visual_jobs enable row level security;

-- The reader filters by age, so the index carries it: every read is "these posts, recent claims".
create index if not exists idx_post_visual_jobs_started_at
  on public.post_visual_jobs using btree (started_at);
