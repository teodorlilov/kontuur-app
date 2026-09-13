-- Follow-ups the review of 20260852 raised after it had been applied (docs/plans/BILLING.md step 1).
--
-- 1. Who may read the two new tables. `ai_usage_daily` is Kontuur's own cost telemetry — what a
--    workspace costs us — and `billing_events` holds raw Stripe event payloads (customer e-mail,
--    card last four, amounts). Neither belongs to every member of an agency: the read stays with
--    the agency's admins, and the cost column is not granted to the tenant role at all, so even an
--    admin's PostgREST client cannot select it. The service role, which writes both, is unaffected.
-- 2. Two integrity checks the first migration left to code: a subscription id and its status
--    arrive together or not at all, and a counter never goes negative (`refund_usage` already
--    clamps at zero; this makes the invariant the table's, not the function's).
--
-- 3. A fourth plan value, 'house': the company's own and partner workspaces — no Stripe row, no
--    brand cap, no allowance, never locks (src/lib/billing/plans.ts). Set by hand, never from the
--    app: `update public.agencies set plan = 'house' where id = '<agency id>'`.
--
-- Apply after 20260852, in the dashboard SQL editor, before the Stripe webhook (step 9) exists.
-- Re-runnable: every policy and constraint is dropped before it is created, because the file grew
-- (item 3) after its first run had already committed and a second run hit "already exists".

drop policy if exists "ai_usage_daily_agency_isolation" on public.ai_usage_daily;
drop policy if exists "ai_usage_daily_admin_read" on public.ai_usage_daily;
create policy "ai_usage_daily_admin_read" on public.ai_usage_daily
  for select to public
  using (
    agency_id = (
      select users.agency_id from users where users.id = auth.uid() and users.role = 'admin'
    )
  );

revoke select on public.ai_usage_daily from anon, authenticated;
grant select (
  id, agency_id, day, provider, model, flow, calls, input_tokens, output_tokens,
  cache_read_tokens, cache_creation_tokens
) on public.ai_usage_daily to authenticated;

drop policy if exists "billing_events_agency_isolation" on public.billing_events;
drop policy if exists "billing_events_admin_read" on public.billing_events;
create policy "billing_events_admin_read" on public.billing_events
  for select to public
  using (
    agency_id = (
      select users.agency_id from users where users.id = auth.uid() and users.role = 'admin'
    )
  );

alter table public.agencies drop constraint if exists agencies_plan_check;
alter table public.agencies
  add constraint agencies_plan_check check (plan in ('trial', 'starter', 'agency', 'house'));

alter table public.agencies drop constraint if exists agencies_subscription_pair_check;
alter table public.agencies
  add constraint agencies_subscription_pair_check
  check ((stripe_subscription_id is null) = (subscription_status is null));

alter table public.usage_counters drop constraint if exists usage_counters_count_check;
alter table public.usage_counters
  add constraint usage_counters_count_check check (count >= 0);

notify pgrst, 'reload schema';
