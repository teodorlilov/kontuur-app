-- The auto-fill marker: WHEN we last asked Meta for this day's totals.
--
-- The NULL contract says a NULL metric means "the API had nothing" — but that
-- is indistinguishable from "we never asked". Without the distinction, a
-- window whose historical days genuinely have no data would re-trigger the
-- full refill (≈200 Graph calls) on every visit, forever. totals_synced_at
-- records the asking itself: NULL = never asked (refillable), set = asked at
-- that instant, whatever came back.
alter table ig_account_metrics
  add column if not exists totals_synced_at timestamptz;

-- Rows the nightly sync wrote were full-day captures — the totals WERE asked.
-- Backfill-only rows (reach + follows, everything else untouched) were not.
update ig_account_metrics
set totals_synced_at = fetched_at
where totals_synced_at is null
  and (
    views is not null
    or total_interactions is not null
    or likes is not null
    or profile_views is not null
    or link_taps_by_button_type is not null
    or reach_by_media_product_type is not null
  );
