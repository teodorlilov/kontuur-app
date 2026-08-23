-- One cron batch per client per slot, enforced by the database.
--
-- The generate cron's dedup guard reads a snapshot of recent runs at invocation start and
-- then inserts. Vercel cron is at-least-once, so two invocations of the same tick both read
-- "nothing ran" and both insert — a full duplicate LLM batch and duplicate drafts in the
-- client's queue. A snapshot read can never close that; only a constraint can.
--
-- `slot_key` is the instant the slot came due, computed by the cron from the client's
-- weekday+hour in the agency's timezone. Both racers compute the same value for the same
-- tick, so exactly one insert wins and the loser skips.
alter table public.generation_runs
  add column if not exists slot_key timestamptz;

comment on column public.generation_runs.slot_key is
  'The scheduled instant this cron batch belongs to. NULL for manual runs, which are never deduped.';

-- Partial on three counts, each load-bearing:
--
--   kind = 'cron'      — a run a human asked for must never cancel a scheduled batch, which is
--                        the same rule the cron''s own dedup query already applies.
--   slot_key not null  — manual runs carry no slot and must not collide with each other.
--   status <> 'failed' — a failed run saved nothing, so the slot is still owed. Updating a row
--                        to 'failed' removes it from a partial index, which is exactly what
--                        lets the same-day retry ticks re-claim the slot.
create unique index if not exists generation_runs_one_batch_per_slot
  on public.generation_runs (client_id, slot_key)
  where kind = 'cron' and slot_key is not null and status <> 'failed';
