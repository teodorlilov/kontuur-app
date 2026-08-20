-- The nightly metrics sync had no memory of its own outcome.
--
-- On 2026-08-20 the cron fired on schedule, returned HTTP 200, and wrote
-- nothing for a client: the run failed partway and the result — {failed: 1}
-- in the response body — went to Vercel and was discarded. The dashboard
-- showed a healthy invocation count, the analytics page showed a fresh "last
-- sync" line (it reads max(fetched_at), which the on-demand refill also
-- writes), and the audience section sat empty for days with nobody able to
-- see why.
--
-- These two columns are the sync's verdict, kept where the reader already
-- looks. last_sync_error is NULL after a clean run and carries the failing
-- phases otherwise ("partial sync (1 of 5 phases) — demographics: …"), so the
-- document can say what is stale instead of implying everything is current.
alter table social_connections
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_error text;

comment on column social_connections.last_sync_at is
  'End of the last metrics sync ATTEMPT for this connection — cron-written only, unlike ig_account_metrics.fetched_at which the on-demand refill also stamps.';
comment on column social_connections.last_sync_error is
  'NULL when the last sync completed every phase; otherwise the aggregate failure naming each phase that broke.';

notify pgrst, 'reload schema';
