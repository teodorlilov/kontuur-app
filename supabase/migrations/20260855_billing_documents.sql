-- One paid plan, and one document for every payment (docs/plans/BILLING.md steps 9 and 10).
--
-- 1. The plan CHECK narrows to ('trial', 'pro', 'house'): Starter and Agency differed only by the
--    brand count, so one plan billed per brand replaced them before anything was sold. The DO
--    block below proves no row carries either before the constraint changes.
-- 2. `document_counters` + `sale_documents`: every paid Stripe invoice becomes one Bulgarian
--    invoice that is also the Наредба Н-18 sale document (чл. 52о ал. 3), numbered from one
--    gapless ten-digit series (ППЗДДС чл. 78) that credit notes share. `issue_sale_document` is
--    the ONE writer: it returns the existing row for a Stripe id it has seen, else takes the next
--    number and inserts in one transaction — a failed insert never burns a number, and two
--    deliveries of one webhook event never mint two documents.
-- 3. A private bucket for the PDFs, read and written by the service role alone.
--
-- RANGE_START is the first number in the range the accountant assigns to Kontuur's documents:
-- a company may run several ranges as long as every number stays unique, and ЧЕЛЛИНГ ООД may
-- already issue invoices from its accounting software. Confirm it before applying; the seed is
-- RANGE_START - 1. `document_counters` deliberately has no policy — it is service-role only, and
-- is listed as such in src/app/__tests__/rls-policies.test.ts.
--
-- Apply in the dashboard SQL editor before the code that writes `plan = 'pro'` deploys, then
-- `npm run db:types`. Re-runnable.

-- ── the one plan ────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.agencies where plan in ('starter', 'agency')) then
    raise exception 'agencies still carry a starter/agency plan; nothing has been sold, so this must not happen';
  end if;
end $$;

alter table public.agencies drop constraint if exists agencies_plan_check;
alter table public.agencies
  add constraint agencies_plan_check check (plan in ('trial', 'pro', 'house'));

-- ── document numbers ────────────────────────────────────────────────────────────────────────

create table if not exists public.document_counters (
  series text primary key,
  last bigint not null
);

-- RANGE_START = 1000000001 → seed 1000000000. Ten digits from the first document on.
insert into public.document_counters (series, last)
values ('documents', 1000000000)
on conflict (series) do nothing;

alter table public.document_counters enable row level security;
revoke select, insert, update, delete on public.document_counters from anon, authenticated;

-- ── the documents ───────────────────────────────────────────────────────────────────────────

create table if not exists public.sale_documents (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique,
  kind text not null check (kind in ('invoice', 'credit_note')),
  agency_id uuid references public.agencies (id) on delete set null,
  stripe_invoice_id text,
  stripe_credit_note_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  refunds uuid references public.sale_documents (id),
  issued_at timestamptz not null,
  customer jsonb not null,
  lines jsonb not null,
  net_cents bigint not null,
  vat_cents bigint not null,
  gross_cents bigint not null,
  vat_rate integer not null,
  vat_basis text not null check (vat_basis in ('domestic', 'oss', 'reverse_charge', 'outside_eu')),
  storage_path text,
  delivered_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists sale_documents_invoice_key
  on public.sale_documents (stripe_invoice_id) where kind = 'invoice';
create unique index if not exists sale_documents_credit_note_key
  on public.sale_documents (stripe_credit_note_id) where stripe_credit_note_id is not null;
create index if not exists sale_documents_agency_issued
  on public.sale_documents (agency_id, issued_at desc);
create index if not exists sale_documents_undelivered
  on public.sale_documents (created_at) where delivered_at is null;

alter table public.sale_documents enable row level security;
drop policy if exists "sale_documents_admin_read" on public.sale_documents;
create policy "sale_documents_admin_read" on public.sale_documents
  for select to public
  using (
    agency_id = (
      select users.agency_id from users where users.id = auth.uid() and users.role = 'admin'
    )
  );
revoke insert, update, delete on public.sale_documents from anon, authenticated;

-- ── the one writer ──────────────────────────────────────────────────────────────────────────

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
begin
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

  begin
    update document_counters set last = last + 1
    where series = 'documents'
    returning last into next_number;
    if next_number is null then
      raise exception 'document_counters has no documents series';
    end if;

    insert into sale_documents (
      number, kind, agency_id, stripe_invoice_id, stripe_credit_note_id, stripe_charge_id,
      stripe_refund_id, refunds, issued_at, customer, lines, net_cents, vat_cents, gross_cents,
      vat_rate, vat_basis
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
      (p->>'issued_at')::timestamptz,
      p->'customer',
      p->'lines',
      (p->>'net_cents')::bigint,
      (p->>'vat_cents')::bigint,
      (p->>'gross_cents')::bigint,
      (p->>'vat_rate')::integer,
      p->>'vat_basis'
    )
    returning * into created;
    return created;
  exception when unique_violation then
    -- A concurrent delivery of the same event won the race; its row is the document. The block's
    -- counter increment is rolled back with it, so the series stays gapless.
    select * into existing
    from sale_documents
    where kind = p->>'kind'
      and (
        (p->>'kind' = 'invoice' and stripe_invoice_id = p->>'stripe_invoice_id')
        or (p->>'kind' = 'credit_note' and stripe_credit_note_id = p->>'stripe_credit_note_id')
      );
    return existing;
  end;
end;
$function$;

revoke execute on function public.issue_sale_document(jsonb) from public, anon, authenticated;
grant execute on function public.issue_sale_document(jsonb) to service_role;

-- ── the PDFs ────────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('billing-documents', 'billing-documents', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
