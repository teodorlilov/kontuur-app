-- Tell a scheduled batch apart from a run a human asked for.
--
-- The generate cron dedups on "did this client already produce today?" by reading
-- every non-failed generation_runs row in the last 26h. The table had no column
-- saying where a run came from, so a one-post run a human triggered at 09:30 —
-- generating from a client idea, say — counted as the 09:00 slot's batch, and every
-- hourly retry for the rest of that local day skipped the client. Silently: the
-- skip path returns early without recording anything in `processed` or `errors`.
--
-- Two values, not three. The wizard and the client-idea flows are now one endpoint
-- and one kind of event — a person pressing Generate — and the dedup only cares
-- whether the scheduler made the run.
--
-- Isolation runs one way only. This is NOT groundwork for the cron consuming client
-- ideas: an idea is a request that needs an agency human to decide it is worth
-- making, and auto-generating from an unread one would put a client's words into
-- production with nobody having agreed to them.
--
-- Existing rows default to 'cron': before this column the cron was the only writer
-- whose runs the dedup was ever meant to count, and treating history as manual
-- would let today's slot re-fire for every client at once.

alter table generation_runs
  add column if not exists kind text not null default 'cron';

-- The default exists only to backfill the rows above. Dropped immediately: a
-- future insert path that forgets `kind` must fail loudly rather than silently
-- count as 'cron' — which would cancel that client's scheduled batch, the exact
-- failure this column exists to end.
alter table generation_runs
  alter column kind drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generation_runs_kind_check'
  ) then
    alter table generation_runs
      add constraint generation_runs_kind_check
      check (kind in ('cron', 'manual'));
  end if;
end $$;

-- The dedup reads recent runs per client, filtered to the scheduler's own.
create index if not exists generation_runs_cron_dedup_idx
  on generation_runs (client_id, created_at desc)
  where kind = 'cron';

notify pgrst, 'reload schema';
