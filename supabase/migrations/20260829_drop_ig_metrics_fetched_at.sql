-- Retire ig_account_metrics.fetched_at.
--
-- Applied by hand in the dashboard on 2026-08-21; this file is the record, not
-- the mechanism — the migration history has never been tracked by the CLI, so
-- nothing replays it. Written so the next reader of 20260822 can see where the
-- column went.
--
-- It was one of two "when did we ask Meta about this day" stamps on the same
-- table, and the weaker of them by construction:
--
--   * NOT NULL DEFAULT now() meant ANY insert stamped it. The online-followers
--     batch fetches no day totals at all, yet a row it created was dated as
--     freshly synced — which is precisely the lie 20260828 was written about.
--   * On an upsert-UPDATE it went untouched, so whether it described the row's
--     creation or its last full capture depended on which writer got there
--     first.
--   * Both full-capture writers set it and totals_synced_at from two separate
--     `new Date()` calls in one object literal. Checked before dropping: across
--     181 rows the two never disagreed, and totals_synced_at was never null.
--
-- totals_synced_at survives because it is load-bearing: it is the auto-fill's
-- memory of which days have been ASKED, which is the one thing the NULL
-- contract cannot express (a null metric means "Meta had nothing", which is not
-- "we never looked"). 20260824 records what losing that distinction costs.
--
-- The report's "last sync" now reads social_connections.last_sync_at, written
-- only by the cron.

alter table ig_account_metrics
  drop column if exists fetched_at;

notify pgrst, 'reload schema';
