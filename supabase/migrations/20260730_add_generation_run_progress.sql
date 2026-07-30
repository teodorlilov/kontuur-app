-- Generation run progress: lets the app shell show "composing drafts" while a
-- batch is in flight. Before this, generation_runs was insert-only (used purely
-- as a cron idempotency guard), so an in-flight run was indistinguishable from a
-- finished one.
--
-- status defaults to 'complete' so every pre-existing row is treated as history
-- and never surfaces as active. Readers additionally require a recent
-- created_at, because a crashed serverless invocation cannot write its own
-- terminal state.
-- Idempotent: safe to re-run.

alter table generation_runs
  add column if not exists status text not null default 'complete',
  add column if not exists target_count integer,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generation_runs_status_check'
  ) then
    alter table generation_runs
      add constraint generation_runs_status_check
      check (status in ('running', 'complete', 'failed'));
  end if;
end $$;

-- The shell polls for runs still marked running within the last few minutes.
create index if not exists generation_runs_active_idx
  on generation_runs (created_at desc) where status = 'running';

notify pgrst, 'reload schema';
