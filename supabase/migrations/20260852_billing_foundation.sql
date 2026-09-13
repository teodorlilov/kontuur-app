-- Billing foundation: the database stops trusting the tenant with its own plan, one atomic
-- allowance ledger replaces the never-refusing image counter, and the agencies row gains what a
-- Stripe-driven state machine needs to be derived from it. docs/plans/BILLING.md step 1.
--
-- Why first: every TypeScript gate that follows is bypassable until this lands. Today
--   - `agencies_member_access` (20260818:31) is FOR ALL with no column grants, so any member can
--     UPDATE plan / subscription_status / trial_ends_at through PostgREST with the anon key, and
--     `users_self_access` (20260818:26) lets a member set their own role to 'admin';
--   - `consume_image_credits` / `refund_image_credits` (baseline 1090-1139) are SECURITY DEFINER with
--     the default EXECUTE TO PUBLIC — no migration in this repo has ever revoked anything — so the
--     anon key can drain or reset any agency's counter with a caller-chosen p_agency_id;
--   - `trial_ends_at` is timestamp WITHOUT time zone under a timestamptz default: the bug class
--     20260843 fixed for posts.scheduled_at, and the column every expiry decision will read.
--
-- What the app reads after this: `entitlementFor` (src/lib/billing/entitlement.ts) derives
-- trial / grace / active / past_due / locked from this row alone — nothing stores the state twice
-- and no cron flips a status column. subscription_status is NULL until Stripe has a subscription;
-- 'trialing' there means a Stripe subscription with a deferred first charge, not the app trial.
--
-- Applying to prod: take a backup, then run this in the dashboard SQL editor — the CLI has never
-- tracked this project's migration history (see the db:push note in docs/CLAUDE.md). Then
-- `npm run db:types` and deploy the code; the code that reads usage_counters must not reach prod
-- before the table exists.

-- ── agencies: the row the entitlement is derived from ───────────────────────────────────────

alter table public.agencies
  alter column trial_ends_at type timestamptz using trial_ends_at at time zone 'UTC';
alter table public.agencies
  alter column trial_ends_at set default (now() + interval '14 days');

update public.agencies
set plan = 'trial'
where plan is null or plan not in ('starter', 'agency');
alter table public.agencies alter column plan set default 'trial';
alter table public.agencies alter column plan set not null;
alter table public.agencies
  add constraint agencies_plan_check check (plan in ('trial', 'starter', 'agency'));

update public.agencies
set subscription_status = null
where stripe_subscription_id is null;
alter table public.agencies alter column subscription_status drop default;
alter table public.agencies
  add constraint agencies_subscription_status_check check (
    subscription_status is null
    or subscription_status in (
      'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'
    )
  );

alter table public.agencies
  add column subscription_quantity integer,
  add column current_period_start timestamptz,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column past_due_since timestamptz,
  add column billing_updated_at timestamptz;

-- Limits live in one place in code (src/lib/billing/plans.ts). This column defaulted to 1 for
-- every agency, was displayed as "N of 1 used" and enforced nowhere.
alter table public.agencies drop column plan_client_limit;

-- Every existing workspace carries a past trial_ends_at. Without this line all of them lock the
-- moment the gate deploys; with it, everyone gets a fresh fortnight from today.
update public.agencies
set trial_ends_at = greatest(trial_ends_at, now() + interval '14 days')
where stripe_subscription_id is null;

-- ── tenant lock ─────────────────────────────────────────────────────────────────────────────
-- The only user-scoped write to agencies is the settings PUT (name, timezone); users is written
-- by the admin client alone (create-user-record.ts, team-actions.ts). Policies are unchanged —
-- SELECT stays scoped by them; column privileges are what stop the plan from being self-served.

revoke insert, update, delete on public.agencies from anon, authenticated;
grant update (name, timezone) on public.agencies to authenticated;
revoke insert, update, delete on public.users from anon, authenticated;

-- ── usage_counters: one atomic allowance ledger for drafts, images and rewrites ─────────────
-- `period` is 'trial' before any subscription, else the ISO date the Stripe period started
-- (src/lib/billing/entitlement.ts). The compare-and-set below is the body of
-- consume_image_credits with a kind column; it only increments while count + cost <= quota.

create table public.usage_counters (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  period text not null,
  kind text not null check (kind in ('draft', 'image', 'rewrite')),
  count integer not null default 0,
  primary key (agency_id, period, kind)
);

alter table public.usage_counters enable row level security;
create policy "usage_counters_agency_isolation" on public.usage_counters
  for select to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

create or replace function public.consume_usage(
  p_agency_id uuid, p_period text, p_kind text, p_cost integer, p_quota integer
)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_count int;
begin
  insert into usage_counters (agency_id, period, kind, count)
  select p_agency_id, p_period, p_kind, p_cost
  where p_cost <= p_quota
  on conflict (agency_id, period, kind) do update
    set count = usage_counters.count + p_cost
    where usage_counters.count + p_cost <= p_quota
  returning usage_counters.count into new_count;

  if new_count is null then
    select u.count into new_count
    from usage_counters u
    where u.agency_id = p_agency_id and u.period = p_period and u.kind = p_kind;
    return query select false, coalesce(new_count, 0);
  else
    return query select true, new_count;
  end if;
end;
$function$;

create or replace function public.refund_usage(
  p_agency_id uuid, p_period text, p_kind text, p_cost integer
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update usage_counters
  set count = greatest(count - p_cost, 0)
  where agency_id = p_agency_id and period = p_period and kind = p_kind;
$function$;

revoke execute on function public.consume_usage(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.refund_usage(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, text, integer, integer) to service_role;
grant execute on function public.refund_usage(uuid, text, text, integer) to service_role;

-- The image counter has been accumulating since 2026-08-31 (image-spend.ts). Carry it across,
-- prove nothing was lost, then retire the table and the two RPCs it existed for.
insert into public.usage_counters (agency_id, period, kind, count)
select agency_id, month, 'image', count
from public.image_generation_usage;

do $$
declare
  copied int;
  original int;
begin
  select count(*) into copied from public.usage_counters where kind = 'image';
  select count(*) into original from public.image_generation_usage;
  if copied <> original then
    raise exception 'usage_counters image rows (%) do not match image_generation_usage (%)', copied, original;
  end if;
end $$;

drop function public.consume_image_credits(uuid, text, integer, integer);
drop function public.refund_image_credits(uuid, text, integer);
drop table public.image_generation_usage;

-- ── ai_usage_daily: what every provider call actually cost, per agency, per feature ─────────
-- Aggregate rather than one row per call, so it needs no retention sweep (a few rows per agency
-- per day). agency_id is null for the one call that belongs to nobody — the global weekly brief —
-- so the uniqueness runs over coalesce(agency_id, zero-uuid). Amounts are euro cents: the
-- providers bill in dollars and src/lib/billing/ai-prices.ts carries their list prices plus the
-- one USD→EUR rate; dollars never reach a row.

create table public.ai_usage_daily (
  id bigint generated always as identity primary key,
  agency_id uuid references public.agencies (id) on delete cascade,
  day date not null,
  provider text not null check (provider in ('anthropic', 'fal', 'tavily')),
  model text not null,
  flow text not null,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_creation_tokens bigint not null default 0,
  cost_eur_cents bigint not null default 0
);

create unique index ai_usage_daily_key on public.ai_usage_daily (
  (coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid)), day, provider, model, flow
);

alter table public.ai_usage_daily enable row level security;
create policy "ai_usage_daily_agency_isolation" on public.ai_usage_daily
  for select to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

create or replace function public.add_ai_usage(
  p_agency_id uuid, p_day date, p_provider text, p_model text, p_flow text,
  p_calls integer, p_input_tokens bigint, p_output_tokens bigint,
  p_cache_read_tokens bigint, p_cache_creation_tokens bigint, p_cost_eur_cents bigint
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into ai_usage_daily (
    agency_id, day, provider, model, flow, calls, input_tokens, output_tokens,
    cache_read_tokens, cache_creation_tokens, cost_eur_cents
  )
  values (
    p_agency_id, p_day, p_provider, p_model, p_flow, p_calls, p_input_tokens, p_output_tokens,
    p_cache_read_tokens, p_cache_creation_tokens, p_cost_eur_cents
  )
  on conflict ((coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid)), day, provider, model, flow)
  do update set
    calls = ai_usage_daily.calls + excluded.calls,
    input_tokens = ai_usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = ai_usage_daily.output_tokens + excluded.output_tokens,
    cache_read_tokens = ai_usage_daily.cache_read_tokens + excluded.cache_read_tokens,
    cache_creation_tokens = ai_usage_daily.cache_creation_tokens + excluded.cache_creation_tokens,
    cost_eur_cents = ai_usage_daily.cost_eur_cents + excluded.cost_eur_cents;
$function$;

revoke execute on function public.add_ai_usage(uuid, date, text, text, text, integer, bigint, bigint, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.add_ai_usage(uuid, date, text, text, text, integer, bigint, bigint, bigint, bigint, bigint)
  to service_role;

-- ── billing_events: Stripe webhook idempotency and the accountant's audit trail ─────────────
-- id is Stripe's event id; the webhook inserts on conflict do nothing and answers 200 to a
-- duplicate before doing any work. Written only by the webhook route through the admin client.

create table public.billing_events (
  id text primary key,
  type text not null,
  created timestamptz not null,
  object_id text,
  agency_id uuid references public.agencies (id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz,
  error text
);

create index billing_events_object_created on public.billing_events (object_id, created desc);

alter table public.billing_events enable row level security;
create policy "billing_events_agency_isolation" on public.billing_events
  for select to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

notify pgrst, 'reload schema';
