# Наредба Н-18 — the alternative regime, as Kontuur runs it

Kontuur takes card payments through Stripe. Under Bulgarian law that is a remote card payment
(ЗДДС чл. 118, ал. 3а), and instead of a fiscal receipt the shop uses the **alternative regime**
of Наредба Н-18 (чл. 3, ал. 17 and чл. 52о–52у): every payment gets an electronic sale document
delivered at the time of payment, and every month a standardised audit file goes to the NRA.
The invoice Kontuur issues carries everything чл. 52о, ал. 1, т. 3–6 asks for, so it **is** the
sale document (чл. 52о, ал. 3) — one document per payment, not two.

The two files beside this one are the NRA's own, vendored as published on 06.06.2022 under
nra.bg → Програмни продукти → Спецификация за подаване на данни → Електронни магазини:

- `dec_audit.xsd` — the schema of the audit file (Приложение 38);
- `vik_simple.xml` — the NRA's sample.

Both are windows-1251 encoded, as published. `src/lib/billing/audit-file.ts` is written against
the schema and its output is held to ASCII so its declared encoding is true.

## Before the first live sale (in this order)

1. **Stripe Dashboard** — business profile ЧЕЛЛИНГ ООД / kontuur.app / statement descriptor
   `KONTUUR`; the Terms and Privacy URLs under public business details (Checkout refuses the
   consent tick without a Terms URL); EUR payouts; Tax → Locations: Bulgaria, domestic, with the
   "small seller" answer *yes* until an OSS registration exists; Stripe's own receipt and invoice
   emails **off**; the customer portal: card update on, name / email / address / tax-ID update
   on, cancellation **off** (a plan ends from inside the app, `setPlanEnding`), subscription update
   **off**, invoice history **off**.
2. **The price** — product "Kontuur", one price: €29, EUR, monthly, per unit, unit label
   "client", tax behaviour exclusive, tax code `txcd_10103001`. Once in test mode, once in live
   mode; each id in that environment's `STRIPE_PRICE_ID`. Checkout refuses a price that is not
   `PRO_PLAN.priceCents` euro a month (`verifiedPriceId`, `src/lib/billing/stripe.ts`).
3. **NRA — Приложение 33** for kontuur.app, with a КЕП, at portal.nra.bg. What it asks for:
   - domain: kontuur.app; own software (this repository); hosting: Vercel (Dublin);
     database: Supabase (EU);
   - payment methods: card only, through a virtual POS;
   - payment service provider: Stripe Technology Europe Limited, VAT IE3206488LH;
   - the payment accounts money lands on: the Stripe balance and the company's bank IBAN;
   - the virtual POS identifier: the Stripe account id (`acct_…`).
   Then `NRA_ESHOP_NUMBER` (the number the NRA assigns) and `STRIPE_ACCOUNT_ID` in Vercel. No
   document can be rendered without them. Changes to any of the above are reported within 7 days.
4. **Accountant** — eight confirmations this build assumes:
   - the invoice may serve as the sale document (чл. 52о, ал. 3);
   - the audit file's payment code for a Stripe charge is 2 (virtual POS), not 4 (payment
     service provider);
   - the tax groups printed on the lines: Б for 20 % Bulgarian VAT, А for reverse charge,
     outside the EU and OSS (`TAX_GROUPS`, `src/lib/billing/document-render.ts`);
   - the document number range assigned to Kontuur (migration 20260855 seeds it) and that
     credit notes share the invoices' sequence;
   - how to report a sale at a fractional OSS rate (25.5 % and the like): the audit file's
     `art_vat_rate` is a whole number, so such a month is refused rather than rounded;
   - how to report a month with refunds and no sale: the schema requires at least one order, so
     such a month is refused;
   - whether a chargeback the bank won is reported as a returned order (the convention below);
   - the credit note's wording: its one line reads "Credit note to invoice No. ‹number› of
     ‹date›" (`issueCreditNote`, `src/lib/billing/documents.ts`), the number and date of the
     invoice it corrects — confirm that, and whether it must also state a reason.
   Plus the OSS registration once the first consumer outside Bulgaria appears — Stripe's
   threshold monitor emails when the €10,000 EU total is near.
5. **Live keys** — `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on Production only; the
   webhook endpoint registered in live mode with the six event types
   (`customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`,
   `credit_note.created`), its API version set to the one the installed SDK pins. The client slots
   change only when an admin changes them in Plan & billing (docs/plans/CLIENT-SLOTS.md), so no
   upcoming-renewal event is needed; Billing → Subscriptions' default billing mode is Flexible, so
   a subscription made by hand prorates like one made at Checkout.

## Every month, by the 15th

```sh
curl -sS -w 'HTTP %{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" \
  "https://kontuur.app/api/billing/audit-file?month=2026-10" -o audit-2026-10.xml
```

The command prints the answer's status; the file holds whatever came back, so read the status
first:

- **HTTP 200** — upload `audit-2026-10.xml` at inetdec.nra.bg (Подаване на стандартизиран
  одиторски файл) with a КЕП;
- **HTTP 204** — the month holds no document and nothing is due; the file is empty;
- **HTTP 409** — the file holds a sentence naming what the schema cannot carry as it stands (a
  fractional rate, refunds with no sale): take it to the accountant, and upload nothing;
- **anything else** — the file holds the error; nothing to upload until it is fixed.

The portal's own validator is the final check on the first upload; if the NRA has republished the
schema for euro amounts, the builder follows it.

Each order is dated by its payment (the tax point, `tax_event_at`) and each document by its issue
(`issued_at`); a month is cut on the issue date. The same month, run
`supabase/queries/undocumented-sales.sql` in the Supabase SQL editor: it lists every paid invoice
that took money and has no document — one made by hand in the Stripe Dashboard (not supported: do
not make them, and take any found to the accountant), or one whose document failed to issue.

## Refunds

Always through Stripe: Dashboard → the invoice → credit note **with refund** of the whole total.
That is the one path that produces a credit note document and a refund line in the audit file. A
bare refund on the charge leaves no document and no line — do not use it. A credit note is issued
only in two shapes, and any other fails loudly (`issueCreditNote`):

- **one refund of the note's whole total** — the normal refund;
- **no refund and the whole total "out of band"** — the convention for a chargeback the bank won:
  the money went back through the card network, not through a Stripe refund, so the credit note
  records it with the original charge as its transaction.

A credit to the customer's balance, a part refund, or two refunds on one note are not supported.
