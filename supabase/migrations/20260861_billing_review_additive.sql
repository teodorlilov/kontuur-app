-- The billing review's additive half (docs/plans/BILLING-REVIEW-FIXES.md, step 1). Everything here
-- is safe under the code that is running when it is applied: new columns are nullable, the two
-- re-created functions accept what the old code sends, and nothing is dropped or narrowed — that is
-- 20260862, applied after the code deploys.
--
-- Corrects 20260855's header by reference: only the paid invoices of subscriptions this app created
-- become sale documents (src/app/api/billing/webhook/route.ts); an invoice made by hand in the
-- Stripe Dashboard is not documented, and docs/n18/README.md says not to make one.
--
-- Apply in the dashboard SQL editor, then `npm run db:types`. Re-runnable.

-- ── notifications: one row per billing event, decided by the database ──────────────────────
-- `notify` (src/lib/notifications/notify.ts) inserts a keyed bell through an upsert that ignores a
-- conflict on (agency_id, dedup_key), so two deliveries of one event write one row. The index is
-- plain, not partial: PostgREST's `on_conflict` needs a plain unique index to infer, and NULL keys
-- never conflict, so every unkeyed insert is untouched.

alter table public.notifications add column if not exists dedup_key text;

-- The billing reminders already sent carry no key, and the first keyed insert after the deploy must
-- conflict with them rather than send the reminder again. Keys are the UTC date of the event the
-- reminder is about, in the formats src/lib/billing/reminders.ts writes. A row is keyed only when it
-- was sent inside the current event's own window — the trial's last three days (TRIAL_NOTICE_DAYS,
-- where shellNotice in src/lib/billing/copy.ts starts), its seven grace days (GRACE_DAYS,
-- src/lib/billing/plans.ts), the current past-due episode — so a
-- reminder about an earlier trial end date never silences the one still to come. Only the newest
-- such row per (agency, type) takes the key, and never a key the agency already holds, so a
-- duplicate the old race wrote cannot break the index and 20260862 can call this again safely.
create or replace function public.billing_backfill_dedup_keys()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  with candidates as (
    select n.id, n.agency_id, n.type, n.created_at,
           n.type || ':' || to_char(
             (case when n.type = 'payment_failed' then a.past_due_since else a.trial_ends_at end)
               at time zone 'UTC',
             'YYYY-MM-DD'
           ) as key
    from notifications n
    join agencies a on a.id = n.agency_id
    where n.dedup_key is null
      and (
        (n.type = 'trial_ending' and a.trial_ends_at is not null
          and n.created_at at time zone 'UTC' >= a.trial_ends_at - interval '3 days')
        or (n.type = 'trial_ended' and a.trial_ends_at is not null
          and n.created_at at time zone 'UTC' >= a.trial_ends_at)
        or (n.type = 'workspace_paused' and a.trial_ends_at is not null
          and n.created_at at time zone 'UTC' >= a.trial_ends_at + interval '7 days')
        or (n.type = 'payment_failed' and a.past_due_since is not null
          and n.created_at at time zone 'UTC' >= a.past_due_since)
      )
  ),
  unclaimed as (
    select c.*
    from candidates c
    where not exists (
      select 1 from notifications o where o.agency_id = c.agency_id and o.dedup_key = c.key
    )
  ),
  ranked as (
    select u.id, u.key,
           row_number() over (partition by u.agency_id, u.type order by u.created_at desc) as rn
    from unclaimed u
  )
  update notifications n
  set dedup_key = r.key
  from ranked r
  where r.id = n.id and r.rn = 1;
$function$;

revoke execute on function public.billing_backfill_dedup_keys() from public, anon, authenticated;

select public.billing_backfill_dedup_keys();

create unique index if not exists notifications_agency_dedup_key
  on public.notifications (agency_id, dedup_key);

-- ── generation_runs: the period a run's drafts were reserved in ────────────────────────────
-- An abandoned run is settled into the period it reserved from (closeAbandonedRuns,
-- src/lib/generation/runs.ts), not the one the entitlement names by the time it is closed.

alter table public.generation_runs add column if not exists period_key text;

-- ── agencies: a short claim around one Stripe quantity write ───────────────────────────────
-- A lock, not a fact: syncSubscriptionQuantity (src/lib/billing/quantity-sync.ts) takes it with a
-- compare-and-set, retrieves the subscription, writes the quantity, and clears it, so two client
-- creates cannot both write a quantity computed from a stale read.

alter table public.agencies add column if not exists quantity_sync_at timestamptz;

-- ── sale_documents: the exact rate, and the tax point beside the document date ─────────────
-- `vat_rate` held a rounded integer, so a 25.5 % OSS sale was documented as 26 %. `issued_at`
-- becomes the moment the number is taken (below); `tax_event_at` keeps the payment's own date.

alter table public.sale_documents alter column vat_rate type numeric(5,2);
alter table public.sale_documents add column if not exists tax_event_at timestamptz;
update public.sale_documents set tax_event_at = issued_at where tax_event_at is null;

-- The one writer of sale_documents, re-created. Same documents are serialised on an advisory lock
-- keyed on the Stripe id, so one lookup decides and no unique-violation handler is needed; the
-- unique indexes stay as the backstop. `issued_at` is `clock_timestamp()` read straight after the
-- counter's update: that row lock is held until commit, so a later number can never carry an earlier
-- date — `now()` is the transaction's start, before the wait, and could. `tax_event_at` is what the
-- issuer sends; the `issued_at` fallback serves only the code running before the deploy, which sends
-- the payment date under that name. Once 20260862 makes the column NOT NULL, a document without a
-- tax point fails on the insert instead of borrowing another date.
create or replace function public.issue_sale_document(p jsonb)
returns public.sale_documents
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  existing sale_documents;
  created sale_documents;
  next_number bigint;
  issued timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtext(
      (p->>'kind') || ':' ||
      coalesce(
        case when p->>'kind' = 'invoice' then p->>'stripe_invoice_id' else p->>'stripe_credit_note_id' end,
        ''
      )
    )
  );

  select * into existing
  from sale_documents
  where kind = p->>'kind'
    and (
      (p->>'kind' = 'invoice' and stripe_invoice_id = p->>'stripe_invoice_id')
      or (p->>'kind' = 'credit_note' and stripe_credit_note_id = p->>'stripe_credit_note_id')
    );
  if found then
    return existing;
  end if;

  update document_counters set last = last + 1
  where series = 'documents'
  returning last into next_number;
  if next_number is null then
    raise exception 'document_counters has no documents series';
  end if;
  issued := clock_timestamp();

  insert into sale_documents (
    number, kind, agency_id, stripe_invoice_id, stripe_credit_note_id, stripe_charge_id,
    stripe_refund_id, refunds, issued_at, tax_event_at, customer, lines, net_cents, vat_cents,
    gross_cents, vat_rate, vat_basis
  )
  values (
    next_number,
    p->>'kind',
    (p->>'agency_id')::uuid,
    p->>'stripe_invoice_id',
    p->>'stripe_credit_note_id',
    p->>'stripe_charge_id',
    p->>'stripe_refund_id',
    (p->>'refunds')::uuid,
    issued,
    coalesce((p->>'tax_event_at')::timestamptz, (p->>'issued_at')::timestamptz),
    p->'customer',
    p->'lines',
    (p->>'net_cents')::bigint,
    (p->>'vat_cents')::bigint,
    (p->>'gross_cents')::bigint,
    (p->>'vat_rate')::numeric,
    p->>'vat_basis'
  )
  returning * into created;
  return created;
end;
$function$;

revoke execute on function public.issue_sale_document(jsonb) from public, anon, authenticated;
grant execute on function public.issue_sale_document(jsonb) to service_role;

-- ── ai_usage_daily: cost without per-call rounding ─────────────────────────────────────────
-- Each call was rounded to whole euro cents before it was added, so a small Haiku call recorded
-- nothing and a Tavily search 45 % more than it cost. The column keeps four decimals of a cent.

alter table public.ai_usage_daily alter column cost_eur_cents type numeric(14,4);

drop function if exists public.add_ai_usage(
  uuid, date, text, text, text, integer, bigint, bigint, bigint, bigint, bigint
);

create or replace function public.add_ai_usage(
  p_agency_id uuid, p_day date, p_provider text, p_model text, p_flow text,
  p_calls integer, p_input_tokens bigint, p_output_tokens bigint,
  p_cache_read_tokens bigint, p_cache_creation_tokens bigint, p_cost_eur_cents numeric
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

revoke execute on function public.add_ai_usage(
  uuid, date, text, text, text, integer, bigint, bigint, bigint, bigint, numeric
) from public, anon, authenticated;
grant execute on function public.add_ai_usage(
  uuid, date, text, text, text, integer, bigint, bigint, bigint, bigint, numeric
) to service_role;

-- ── usage_counters: reservations stranded before 20260858 ──────────────────────────────────
-- A row that held `pending` before `reserved_at` existed has no stamp, and the daily release
-- (clearStaleReservations, `reserved_at < cutoff`) never matches NULL. Dating it a day back lets the
-- next release free it.

update public.usage_counters
set reserved_at = now() - interval '1 day'
where pending > 0 and reserved_at is null;

-- ── team_invites: an invite is a server row, never the invitee's own metadata ──────────────
-- `createUserRecord` (src/lib/auth/create-user-record.ts) joined whatever workspace and role a new
-- login's `user_metadata` named, which anyone can write at sign-up. An invite is now this row,
-- written by the invite route and consumed on first join. There is no email column: the address is
-- `auth.users`', and `pending_invite_for_email` below reads it there. Service role only — no policy
-- (listed in src/app/__tests__/rls-policies.test.ts).

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists team_invites_one_pending
  on public.team_invites (auth_user_id) where accepted_at is null;
create index if not exists team_invites_agency on public.team_invites (agency_id);

alter table public.team_invites enable row level security;
revoke select, insert, update, delete on public.team_invites from anon, authenticated;

-- Whether an address already holds a pending invite, asked before an invite is sent: PostgREST
-- cannot read the `auth` schema and the admin API has no lookup by email.
create or replace function public.pending_invite_for_email(p_email text)
returns setof public.team_invites
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.*
  from team_invites t
  join auth.users u on u.id = t.auth_user_id
  where lower(u.email) = lower(p_email)
    and t.accepted_at is null;
$function$;

revoke execute on function public.pending_invite_for_email(text) from public, anon, authenticated;
grant execute on function public.pending_invite_for_email(text) to service_role;

-- ── users.role: the two roles the app checks ───────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.users where role not in ('admin', 'member')) then
    raise exception 'users carries a role other than admin or member; resolve it before this constraint';
  end if;
end $$;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin', 'member'));

notify pgrst, 'reload schema';
