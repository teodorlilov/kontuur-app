# Billing tests: technical suite

The lower-level checks behind the customer journeys in [../README.md](../README.md), run by hand
on kontuur.app's Stripe sandbox. They check the database, Stripe's records, the webhook and crons,
and the NRA audit file. They cover what `docs/plans/BILLING.md`,
`docs/plans/BILLING-REVIEW-FIXES.md` and `docs/plans/CLIENT-SLOTS.md` built: the trial, Checkout,
client slots, renewals and failed payments, cancelling and deleting, invoices and credit notes,
the audit file, allowances, invites, and the capture guard.

## Files

| File                                    | Covers                                     | Scenarios | `@core` |
| --------------------------------------- | ------------------------------------------ | --------: | ------: |
| `01-setup-and-trial.feature`            | wiring, trial caps, reminders, the pause   |        25 |       8 |
| `02-checkout.feature`                   | first payment, return card, a second plan  |        28 |      11 |
| `03-client-slots.feature`               | buy, raise, restore and lower slots; cap   |        37 |      10 |
| `04-renewal-and-failed-payment.feature` | test clock, renewal, failed card, pause    |        25 |       7 |
| `05-cancel-resubscribe-delete.feature`  | cancel, keep, re-subscribe, delete         |        24 |       5 |
| `06-invoices-and-credit-notes.feature`  | documents, VAT bases, refunds, chargebacks |        24 |       5 |
| `07-audit-file-and-retries.feature`     | monthly audit file, delivery retries       |        26 |       3 |
| `08-webhook-and-billing-cron.feature`   | signatures, replays, ordering, cron auth   |        14 |       4 |
| `09-allowance-and-bells.feature`        | meters, 80 % and 100 % bells, owed images  |        31 |       4 |
| `10-invites-and-roles.feature`          | invites, members vs admins, removal        |        31 |       8 |
| `11-capture-guard.feature`              | private-address refusal in site capture    |        28 |       3 |
|                                         |                                            |   **293** |  **68** |

## How to run them

- **Start with `@core`** (68 scenarios): every happy path plus the refusals that protect money,
  documents and access. Everything else is a deeper pass.
- Run a file top to bottom after its `Background`. Scenarios build on earlier ones in the same file
  (a `Given` names the scenario it needs, e.g. "(R3)"). Don't mix files.
- **Tags**
  - `@positive` / `@negative` / `@edge`: what kind of case it is.
  - `@clock`: needs the Stripe test clock (see below).
  - `@write`: changes the database by hand. Run it only on the test workspace it names.
  - `@defect-Dn`: expected to fail today; see Known defects.
- A `# sql:` comment is a query for the Supabase SQL editor, given only where the database is the
  sole proof. It is read-only, except in a `@write` scenario, or a `Background` that `@write`
  scenarios use, where it may write, and only on the test workspace that scenario names.

## Before you start

1. **Vercel env (Production), then redeploy:** `STRIPE_SECRET_KEY` (`sk_test_…`),
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_ACCOUNT_ID` and `NRA_ESHOP_NUMBER` (no invoice
   PDF without these two), `CRON_SECRET` (for the curl calls), `RESEND_API_KEY`,
   `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL=https://kontuur.app`. Optional: `STRIPE_TEST_CLOCK` for
   `@clock` scenarios.
2. **Stripe sandbox:**
   - One price: €29.00, EUR, monthly, per unit, **tax-exclusive**. Checkout refuses any other.
   - Tax registration for Bulgaria, and a Terms URL in Public details.
   - Portal: cancellation off, subscription update off (slots change only in Plan & billing).
   - Settings → Billing → Subscriptions → default billing mode: "Flexible and hide classic".
     Checkout pins flexible itself; the default makes a subscription created by hand match.
   - Webhook `https://kontuur.app/api/billing/webhook`, API `2026-08-26.dahlia`, six events:
     `customer.subscription.created|updated|deleted`, `invoice.paid|payment_failed`,
     `credit_note.created`. No `invoice.upcoming`, and the upcoming-renewal event setting is off.
3. **Test clock:** a customer joins the clock only when its workspace first presses Choose plan
   with `STRIPE_TEST_CLOCK` set. Use fresh workspaces for `@clock`; a clock holds only a few
   customers.
4. **Test accounts:** "Confirm email" stays on. Use plus-addresses of one inbox (`you+e2e-a1@…`).
   Each file's `Background` names the workspaces it needs.
5. **Database:** every file in `supabase/migrations` is applied. `supabase/held/20260866` (it
   drops `sale_documents.refunds` and `sale_documents.created_at`) is applied only after the code
   deploys, since the code before it still reads both columns; the delivery retry reads `issued_at`.

## Known defects

Found while writing these tests, verified against the code, **not fixed yet**. The tagged scenarios
fail until they are.

| ID  | Severity | Scenario | What happens                                                                   |
| --- | -------- | -------- | ------------------------------------------------------------------------------ |
| D1  | high     | C32, X41 | A Checkout left open is payable after the delete, and nothing cancels it       |
| D5  | high     | C53      | Two tabs get two payable Checkout sessions                                     |
| D14 | high     | N48      | A coupon makes the month's audit file answer 500                               |
| D15 | high     | K4       | analyze-url and the brand re-read have no private-address check                |
| D12 | high     | D45      | A document could name a failed charge (depends on Stripe's behaviour)          |
| D11 | high     | Q14, R14 | A declined slot raise may leave an invoice Stripe later collects (unconfirmed) |
| D2  | medium   | C14, C29 | The Checkout return card vanishes at its first 3 s refresh                     |
| D4  | medium   | C47      | A Stripe customer deleted by hand blocks Checkout                              |
| D6  | medium   | T45      | An incomplete subscription locks a trial                                       |
| D10 | medium   | R13      | A paused workspace tells a member to update the card                           |
| D13 | medium   | N40      | `undocumented-sales.sql` misses €0 failures paid from a balance                |
| D16 | medium   | K5       | A failed re-analyse overwrites the palette with defaults                       |
| D17 | low      | K13      | An onboarding session id can be taken over                                     |
| D19 | low      | S30      | The invite route does not check solo mode                                      |

D3, D8 and D9 are gone: the client-slot model (`docs/plans/CLIENT-SLOTS.md`) removed them. D18 is
fixed: `removeTeamMember` expires the removed person's user record at once, so S24 is no longer
tagged. D7 is fixed: /generate gates "Add your first client" like every Add-client control (Q39).
D10 keeps only its member half: the Generate page at the limit now asks for the card (R42).
