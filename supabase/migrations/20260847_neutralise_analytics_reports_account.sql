-- The report archive's account column stops being Instagram-named.
--
-- `analytics_reports` was born network-ready in one half: `platform` is NOT NULL and part of
-- the unique key, written 'instagram' by the one writer. The other half lagged — the account
-- column is `ig_account_id`, and a Facebook archive row would put a Page id in an
-- Instagram-named column, which is a column meaning two things.
--
-- Renamed rather than recreated, following 20260844/20260845: every existing row IS an
-- Instagram report, no data moves, and NULL keeps its meaning (deliverables archived before
-- account stamping — see purge-account-metrics.ts, whose legal-erasure sweep reads it).
--
-- Postgres carries the unique constraint through the rename; only its NAME goes stale, and
-- nothing reads it by name (the writer's onConflict names columns). Left as-is, per
-- 20260845's precedent.

alter table analytics_reports rename column ig_account_id to platform_account_id;
