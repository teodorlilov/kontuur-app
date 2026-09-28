-- Paid invoices with no sale document — paste into the Supabase dashboard SQL editor every month,
-- beside the audit file (docs/n18/README.md, "Every month, by the 15th"). Change the two dates.
--
-- Every Stripe event is kept in `billing_events` (`recordBillingEvent`,
-- src/lib/billing/stripe-events.ts), so this still finds a sale after the webhook's
-- `undocumented_sale` log line has aged out of the logs. A row is either:
--   - an invoice this app did not make — one made by hand in the Stripe Dashboard, which gets no
--     document: take it to the accountant, and do not make such invoices;
--   - a document the webhook failed to issue (`error` set, `processed_at` empty): resend the event
--     from Stripe (Developers → Webhooks → the event → Resend).
--
-- Read-only.

select
  e.created,
  e.object_id as stripe_invoice,
  (e.payload -> 'data' -> 'object' ->> 'amount_paid')::int as cents_paid,
  e.agency_id,
  e.processed_at,
  e.error
from public.billing_events e
where e.type = 'invoice.paid'
  and (e.payload -> 'data' -> 'object' ->> 'amount_paid')::int > 0
  and not exists (
    select 1
    from public.sale_documents d
    where d.kind = 'invoice' and d.stripe_invoice_id = e.object_id
  )
  and e.created >= date '2026-10-01'
  and e.created < date '2026-11-01'
order by e.created;
