-- Two fixes the review of 20260857 produced after it had reached production.
--
-- 1. The daily release of unsettled reservations (src/lib/billing/usage.ts,
--    clearStaleReservations) must not touch a reservation that is in flight. The billing cron
--    fires at 08:00 UTC, the same minute as the hourly generate cron, whose batches are reserved
--    seconds before it runs — a blind reset would zero a live reservation every day and, once
--    both settled, let `count` pass the quota. `reserved_at` records when a row was last reserved
--    on; the release only touches rows quiet for ten minutes, longer than any invocation may live.
--
-- 2. `settle_usage` was an update, so a settle addressed to a period with no row yet — the
--    reservation made in the last minute of the old period, the entitlement re-read after the
--    renewal — updated nothing and the landed unit was counted nowhere. An upsert counts it in the
--    period the settle names.
--
-- Both functions are re-created in place; privileges survive `create or replace`.

alter table public.usage_counters
  add column reserved_at timestamptz;

create or replace function public.consume_usage(
  p_agency_id uuid, p_period text, p_kind text, p_cost integer, p_quota integer
)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  committed int;
begin
  insert into usage_counters (agency_id, period, kind, count, pending, reserved_at)
  select p_agency_id, p_period, p_kind, 0, p_cost, now()
  where p_cost <= p_quota
  on conflict (agency_id, period, kind) do update
    set pending = usage_counters.pending + p_cost, reserved_at = now()
    where usage_counters.count + usage_counters.pending + p_cost <= p_quota
  returning usage_counters.count + usage_counters.pending into committed;

  if committed is null then
    select u.count + u.pending into committed
    from usage_counters u
    where u.agency_id = p_agency_id and u.period = p_period and u.kind = p_kind;
    return query select false, coalesce(committed, 0);
  else
    return query select true, committed;
  end if;
end;
$function$;

create or replace function public.settle_usage(
  p_agency_id uuid, p_period text, p_kind text, p_reserved integer, p_landed integer
)
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  insert into usage_counters (agency_id, period, kind, count, pending)
  values (p_agency_id, p_period, p_kind, p_landed, 0)
  on conflict (agency_id, period, kind) do update
    set pending = greatest(usage_counters.pending - p_reserved, 0),
        count = usage_counters.count + p_landed
  returning count;
$function$;

notify pgrst, 'reload schema';
