-- Client slots (docs/plans/CLIENT-SLOTS.md): the admin chooses how many clients the paid plan pays
-- for, and the workspace holds at most that many. `client_slots` is Stripe's subscription item
-- quantity — the cap on clients and what the next renewal bills. It is not a copy of
-- `subscription_quantity`, which stays the count paid for in the current period (the allowance):
-- the two differ after a lower, which takes effect at renewal, until that renewal is paid.
--
-- The one writer is `applySubscriptionSnapshot` (src/lib/billing/subscription-store.ts), on every
-- snapshot of the row's own subscription. The CHECK allows 0 because Stripe accepts a quantity of 0
-- set by hand in its Dashboard, and the writer must never throw on what Stripe holds.
--
-- Additive: the code deployed before this change ignores the column. The backfill gives every row
-- with a subscription the count it last paid for; the next Stripe event writes Stripe's own value.
-- Applied before the deploy (docs/plans/CLIENT-SLOTS.md, Deploy order). Re-runnable.

alter table public.agencies
  add column if not exists client_slots integer check (client_slots >= 0);

comment on column public.agencies.client_slots is
  'Client slots on the Stripe subscription (its item quantity): the paid plan''s client cap and what '
  'the next renewal bills. Written only by applySubscriptionSnapshot (src/lib/billing/subscription-store.ts).';

update public.agencies
set client_slots = subscription_quantity
where stripe_subscription_id is not null
  and client_slots is null
  and subscription_quantity is not null;

notify pgrst, 'reload schema';
