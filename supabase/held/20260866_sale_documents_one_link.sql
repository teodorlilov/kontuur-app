-- HELD: this file lives in supabase/held, out of the folder migrations are applied from. Once
-- production runs the deploy that stops reading these columns (and one invoice.paid has gone
-- through end to end), move it into supabase/migrations, apply it alone, then `npm run db:types`.
--
-- sale_documents keeps one link and one date per fact. Applied before that deploy it breaks
-- production: the code before it selects `refunds` and `created_at` on every document read
-- (SALE_DOCUMENT_COLUMNS, src/lib/queries/select-columns.ts) and its delivery retry filters on
-- `created_at` (fetchUndeliveredSaleDocumentIds, src/lib/billing/documents.ts), so the Account
-- tab's list, every delivery, every credit note and the audit file would fail.
--
-- 1. `refunds` goes. It was written on every credit note and read by nothing: the credit note's
--    `stripe_invoice_id` already names its invoice, and `sale_documents_invoice_key` (20260855)
--    makes that exactly one invoice document. Dropping the column drops its self-referencing key.
-- 2. `created_at` goes. Since 20260861, `issued_at` is `clock_timestamp()` inside the same
--    transaction whose `now()` filled `created_at`, so the two differ by a lock wait; the retry now
--    reads `issued_at`, and its partial index moves with it.
-- 3. `issue_sale_document` is re-created as 20260861 wrote it, minus `refunds` and minus the
--    `issued_at` fallback for the tax point, which served only the code before that deploy
--    (20260862 made `tax_event_at` NOT NULL). Same security, search path and grants.
--
-- Rollback boundary: once applied, the code from before that deploy no longer runs, and 20260861
-- and 20260863 must never be run again — this file is then issue_sale_document's definition. To
-- roll the code back, first restore the columns:
--   alter table public.sale_documents
--     add column if not exists refunds uuid references public.sale_documents (id),
--     add column if not exists created_at timestamptz not null default now();
--   notify pgrst, 'reload schema';
--
-- Re-runnable.

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
    stripe_refund_id, issued_at, tax_event_at, customer, lines, net_cents, vat_cents,
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
    issued,
    (p->>'tax_event_at')::timestamptz,
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

drop index if exists public.sale_documents_undelivered;
create index if not exists sale_documents_undelivered
  on public.sale_documents (issued_at) where delivered_at is null;

alter table public.sale_documents drop column if exists refunds;
alter table public.sale_documents drop column if exists created_at;

notify pgrst, 'reload schema';
