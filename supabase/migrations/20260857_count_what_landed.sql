-- Count what landed (docs/plans/BILLING.md, step 13).
--
-- `usage_counters.count` used to move at the reservation, before the provider was asked, and a
-- failed generation left the meter only through a refund afterwards. A refund that never ran —
-- the function killed at its time limit, an RPC error that was only logged — left the failure on
-- the customer's meter for the rest of the period (observed 2026-09-19: 16 calls, 15 pictures,
-- 16 counted). From here `count` is what landed and `pending` is what is in flight:
--
--   consume_usage  reserves into `pending`, still atomic on count + pending against the quota,
--                  so the cap holds under concurrent calls and a refusal costs nothing;
--   settle_usage   ends a reservation — releases `pending`, adds to `count` only what landed —
--                  and returns the new count so the 80 % bell fires on real usage.
--
-- `refund_usage` is dropped: a settle with nothing landed is the refund. A reservation an
-- invocation died holding stays in `pending` until the daily billing cron releases it
-- (src/lib/billing/usage.ts, clearStaleReservations). Applied to production 2026-09-19 in this
-- form; 20260858 ages that release and makes the settle an upsert. Apply BEFORE the code that
-- calls settle_usage deploys.

alter table public.usage_counters
  add column pending integer not null default 0 check (pending >= 0);

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
  insert into usage_counters (agency_id, period, kind, count, pending)
  select p_agency_id, p_period, p_kind, 0, p_cost
  where p_cost <= p_quota
  on conflict (agency_id, period, kind) do update
    set pending = usage_counters.pending + p_cost
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
  update usage_counters
  set pending = greatest(pending - p_reserved, 0),
      count = count + p_landed
  where agency_id = p_agency_id and period = p_period and kind = p_kind
  returning count;
$function$;

drop function public.refund_usage(uuid, text, text, integer);

revoke execute on function public.settle_usage(uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.settle_usage(uuid, text, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
