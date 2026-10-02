# 6 · Getting my invoices, credit notes and refunds: setup and coverage

Technical IDs are the scenario and Examples IDs of `technical/06-invoices-and-credit-notes.feature`
(D…) and `07-audit-file-and-retries.feature` (N…). The long verified cases were read beside them; where a
long case adds something, it is named as "detailed case D1" (the detailed D cases) or "detailed case N38".
Careful: the N numbers of 07 are not the detailed cases' N numbers (07's N2 is detailed case N38).

Workspaces used here, and the technical workspace each stands for: E2E Sofia = D-W1 (with member M1),
E2E Berlin = D-W2, E2E San Francisco = D-W3 (all on clock C1); E2E Munich = D-W4, E2E Zurich = D-W6,
E2E Plovdiv = D-W5 (on clock C2); E2E Bakery = a solo workspace in place of D-W5 for the 3-D Secure case;
E2E Varna = the paused workspace of 07's N2 (its own clock, C4); E2E Ruse = 07 N47's paid workspace with no
test clock; E2E Burgas = 07 N48's test-clock workspace (its own clock, C3).

## Covers

- 6.1 ← D2 (detailed case D1, detailed case N1)
- 6.2 ← D3
- 6.3 ← D8, D11, D24, D48
- 6.4 ← D8, D11, D24, D48 (the customer block and tax group of the same four invoices)
- 6.5 ← D12
- 6.6 ← D14, N21 (its customer part: the renewal's row and email dated today)
- 6.7 ← D15
- 6.8 ← D16, N22 (its customer part: the credit-note row and email dated today in Sofia)
- 6.9 ← D18, D20, D51, and D16's credit-note Order and QR text (cn_…, then re_… or the chargeback's ch_…)
- 6.10 ← D50
- 6.11 ← D22, D27, D28, D29, D30, N40 (their customer parts: a charge, or a renewal, with no invoice after
  it; detailed case D26 for the renewal paid from credit)
- 6.12 ← D21, D19, D25, D23
- 6.13 ← D6 (detailed case D39 for the rows behind the page)
- 6.14 ← N4 (its hour and reload rows; detailed case D7, detailed case N4)
- 6.15 ← N5 (with its "no email is sent")
- 6.16 ← N2 (detailed case N38)
- 6.17 ← N9, N11 (their customer parts; detailed case D9, D10, detailed case N12)
- 6.18 ← N13, D49 (detailed case N42: two resends at once still mail once)
- 6.19 ← D13, N23 (its customer part: row and email dated "1 October 2026")
- 6.20 ← D44
- 6.21 ← D42 (detailed case D40, D41: the empty list before any payment)
- 6.22 ← D31 (detailed case D46: the owner-less credit note)
- 6.23 ← D54
- 6.24 ← D45 (defect D12)
- 6.25 ← N47 (its customer part: no row until Kontuur records the payment, then the row, the email and
  "Issued" on the 1st, and "Tax point" the old month's last day)
- 6.26 ← N14 (its customer part: the renewal's row stays "Preparing…", and no email ever comes)
- 6.27 ← N48 (defect D14; its customer part: the half-price PDF's rows against its "Net"). If the founder
  takes the defect's other fix (refuse the document), this becomes a `@defect-D14` row of 6.11 instead.

## Setup

Dates on a clock workspace: every date Stripe stamps (the PDF's "Tax point", the credit note's tax point) is
the clock's date; "Issued", the Invoices row and the email are the real date. Both are right.

- a workspace that later renews or is declined (6.6, 6.7, 6.9, 6.11, 6.12, 6.16, 6.22, 6.24, 6.26, 6.27) →
  set `STRIPE_TEST_CLOCK` in Vercel and redeploy before its first Choose plan; a customer joins a clock only
  when it is created (06 Background: Sofia, Berlin, San Francisco on C1; Munich, Plovdiv, Zurich on C2;
  Burgas on C3 and Varna on C4, each a clock made for it in the Stripe Dashboard and set as
  `STRIPE_TEST_CLOCK` before that workspace's first Choose plan).
- E2E Ruse (6.25) → it must be on no clock: clear `STRIPE_TEST_CLOCK` in Vercel and redeploy before its first
  Choose plan, then set it back (07 N47: "a paid no-clock workspace"). Pay that first Checkout on a day
  that puts Ruse's renewal more than a day away from the month's last evening: not on a 1st, nor on a day
  number equal to or above that evening's (the renewal keeps the Checkout's day, or the month's last day).
  A renewal under about 13 hours away leaves the slot raise's pro-rata amount under Stripe's €0.50
  minimum (plus a two-cent margin), so it is billed on the renewal and no invoice is issued that night
  (detailed case N47 Before; `chargesToday`, src/lib/billing/plans.ts).
- I add a client slot, and my card is charged pro rata (6.5, 6.17–6.20, 6.23, 6.25) → as the admin, on an
  active plan not set to end: Plan & billing → + beside "Client slots" → "Change" → "Add slot". No client
  is added: a slot raise needs none, and adding or deleting a client never changes the bill. The confirm
  must say the amount "is charged today for the rest of this period"; if it says it "is added to your
  invoice on" the renewal instead (under about 13 hours to go), press "Keep ‹n›" and run it another day,
  since that amount waits for the renewal with no invoice of its own. If the control reads "Your renewal
  is being processed. You can change your client slots again in a few minutes.", wait and reload. On a
  clock workspace the app measures the clock's period against today's real date: after a clock advance
  the confirm's "About ‹amount›" can read high (the invoice carries Stripe's exact amount), and a clock
  left standing past its "Renews on" shows that renewal line until the clock is advanced.
- I pay … by card → card 4242 4242 4242 4242 at Checkout, unless the step names another kind of card.
- with an address in ‹city›, as ‹I pay as› → Sofia: ul. Shipka 1, 1000 Sofia; Munich: Marienplatz 1,
  80331 München; San Francisco: 1 Market St, San Francisco, CA 94105; Berlin: Friedrichstr. 1, 10117
  Berlin, tick purchasing as a business, "D-W2 Berlin GmbH", tax ID DE123456789; Zurich: Bahnhofstrasse 1,
  8001 Zürich, business "D-W6 Zurich AG", tax ID type Switzerland VAT, CHE-123.456.789 MWST (D1, D8, D9,
  D24, D48). E2E Bakery and E2E Plovdiv: a Plovdiv address, no business option (D42). E2E Ruse and
  E2E Burgas: an address in that town, no business option.
- my plan renews → Stripe Dashboard → Test clocks → the workspace's clock (C1, C2 or C3, as above) → advance
  to 2 hours past the period end, wait for Ready (D14; 07 N14, N48). Every workspace on that clock renews on
  the same advance; that is expected.
- a card that will be declined → as the admin, Manage billing → add 4000 0000 0000 0341 and make it the
  default (D15).
- my renewal payment is declined / my renewal payment was declined → with 0341 as the default card, advance
  the clock 2 hours past the next period end (D15; for Berlin, D45 step 1).
- I make a working card my default … and a day passes (6.7) → Manage billing → add 4242 as the default;
  advance C1 one more day; if the invoice is still Open, charge the default card on it in the Stripe
  Dashboard (D15).
- Kontuur refunds that invoice in full (6.8) / later Kontuur refunds it in full (6.22) → one-line invoices:
  Stripe Dashboard → the invoice → Create credit note, every line at full quantity, refund to the card for
  the whole total, issue (D16, D46).
- Kontuur refunds my newest pro-rata invoice in full (6.18) / Kontuur then refunds that pro-rata invoice in
  full (6.23) → the slot raise's invoice: Stripe Dashboard → the invoice → Create credit note for the whole
  invoice, refund the whole total to the card, issue (D49, D54).
- Kontuur credits all of it, after my bank's chargeback → credit note for the whole invoice, the whole
  total "outside of Stripe", no refund (D18).
- Kontuur credits €5.00 of it plus VAT, to my card → credit note for €5.00 of the line, refund the note's
  whole total (Stripe adds the VAT) (D20). The row and the PDF's "Total" must equal the note's total as
  Stripe shows it (€6.00 at 20 %); if Stripe shows another total, record it.
- Kontuur credits €0.01 of it, to my card → credit note for €0.01 of the line, refund its whole total; if
  Stripe refuses a one-cent note or refund, record it and stop (D51).
- Kontuur refunds €10.00 of it to my card, and later the other €19.00 → two credit notes on the same
  invoice, €10.00 then €19.00, each refunded to the card in full (D50).
- Kontuur bills me a one-off €10.00 outside my plan (Berlin) → Stripe Dashboard → Invoices → Create invoice
  for Berlin's customer, one-off item €10.00 → charge the customer's default payment method automatically,
  finalize; if it is still Open after a minute, Charge customer (D22). 6.12's last row refunds it.
- my plan renews and also collects €5.00 I owed from before → Stripe Dashboard → Munich's customer → Adjust
  balance → a €5.00 debit (the customer owes); then advance C2 as for "my plan renews" (D27).
- Kontuur gives me my next month free → with Munich's balance at €0.00: Stripe Dashboard → Product
  catalogue → Coupons → 100 % off, duration Once; Munich's subscription → Update subscription → add it, no
  proration (D28).
- Kontuur takes €5.00 off my declined renewal, then I pay the rest → as the admin, Manage billing → make
  0341 the default; advance C2 past the next period end (the renewal fails); Stripe Dashboard → the open
  invoice → Create credit note for €5.00 of its line, issue; Manage billing → make 4242 the default; Stripe
  Dashboard → the open invoice → charge the default card for the rest (D29).
- Kontuur records my unpaid renewal as paid another way, with no card on file → Stripe Dashboard → Munich's
  customer → Payment methods → remove every card; advance C2 past the next period end; the open invoice →
  change its status to paid, "paid outside of Stripe" (D30). Leave Munich with no card: 6.22 needs that.
- my plan renews, paid in full from credit Kontuur gave me → Stripe Dashboard → Munich's customer → Adjust
  balance → a €40.00 credit; advance C2 as for "my plan renews"; then debit the €5.20 left, or 6.22's
  renewal is refused the same way (07 N40; detailed case N40).
- Kontuur refunds all of it, with no credit note → Stripe Dashboard → Payments → the payment → Refund the
  full amount; decline any credit note Stripe offers (D21).
- Kontuur refunds €10.00 to my card, the rest another way → credit note for the whole invoice, split:
  €10.00 refund to the card, the rest "outside of Stripe"; if the Dashboard allows only one method per note,
  the row is not testable by hand (D19).
- Kontuur keeps all of it as credit for my next payments → credit note for the whole invoice, credited to
  the customer's balance (D25). Clear the balance with a debit before the next C2 advance (6.22's), or that
  renewal of E2E Zurich is refused for the credit.
- my card paid the one-off from 6.11 / Kontuur refunds all of it to my card → Stripe Dashboard → 6.11's
  €10.00 one-off invoice → Create credit note for the whole invoice, refund it to the card, issue (D23).
- the stored PDF of one of my documents has gone missing → click Download and save the file as
  ‹number›.pdf; Supabase → Storage → billing-documents → the workspace's folder → delete that file only
  (07 N5). The missing PDF is put back → upload the saved file into the same folder, same name.
- paused after 7 days without paying my declined renewal → 0341 as default, advance C4 (Varna's own clock,
  so no other workspace renews) past the renewal, then the SQL write of 04's R16 on this workspace only:
  `update agencies set past_due_since = now() - interval '7 days' + interval '10 minutes'
  where id = :agency_id and subscription_status = 'past_due';`
  and wait 11 minutes (07 N2, 04 R16).
- Kontuur cannot prepare invoice PDFs for a while → Vercel (Production): note `NRA_ESHOP_NUMBER`, delete
  it, redeploy; run no other payment meanwhile (07 N9). Kontuur has fixed it → put the same value back,
  redeploy (07 N11).
- Kontuur cannot send email for a while → Vercel: note and delete `RESEND_API_KEY` (07 N13, invoice row) or
  `RESEND_FROM_EMAIL` (D49, credit-note row), redeploy, clear of 08:00 UTC; every app email fails meanwhile.
  Email works again → put it back, redeploy.
- a day has passed (6.17, 6.18) / a day later (6.26) → not 6.7's "a day passes", which is the clock: wait
  for the 08:00 UTC billing tick, or, once the document is over 10 minutes old:

  ```sh
  curl -sS -w 'HTTP %{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" \
    https://kontuur.app/api/cron/billing
  ```

  (07 N11, N13, N14; for 07 N13's second row fire two at once: still one email). For 6.26, check again
  after the next 08:00 UTC tick.
- it is 00:10 in Sofia, while in San Francisco it is still the previous day → act between 00:00 and 00:59
  Sofia time (21:00–21:59 UTC until 25 October); the night of 30 September → 1 October 2026 also gives
  07 N23's "1 October 2026" (D13, N23). Do not run 07's N22 the same night after this, nor 6.25.
- a card that asks for my bank's check / I fail the check / I pass the check → card 4000 0025 0000 3155;
  in Stripe's test authentication window click Fail, then pay again and click Complete (D42).
- a card whose refunds will fail → Manage billing → add 4000 0000 0000 5126 as the default card (D54).
  The refund to my card later fails at my bank → wait until Stripe → Payments → the charge → Refunds
  shows Failed.
- I cancelled and deleted my workspace "E2E Munich" while its renewal payment was still unpaid → Munich's
  customer has no card (as 6.11's no-card row left it; otherwise remove its cards in the Stripe Dashboard)
  and no balance; advance C2 past the renewal, then Cancel plan and delete the workspace in the app (D31).
- that €34.80 renewal is charged to my card after all → Stripe Dashboard → the customer → add 4242; the
  still-open invoice → charge that new card; if Stripe voided the invoice on cancellation, stop and record
  it (D31).
- Kontuur marks that renewal as paid another way, such as by bank transfer → Stripe Dashboard → Berlin's
  open renewal invoice → change its status to paid, "paid outside of Stripe" (D45).
- paying for 1 client, at 23:50 on the last day of a month / Kontuur records my payment only after
  midnight → the last evening of a month, at the keyboard 23:45–00:15 Sofia; not the night of 6.19 or of
  07's N22; nothing else paid in the sandbox meanwhile. About 23:45 Sofia: Stripe Dashboard → Developers →
  Webhooks → the kontuur.app endpoint → Disable; about 23:50 add the client slot (Plan & billing updates
  at once, but the invoice's document waits for its invoice.paid); after 00:05 Sofia enable it again, and
  Resend that invoice's invoice.paid and the raise's customer.subscription.updated to the endpoint if they
  show no delivery (07 N47's first three steps; detailed case N47).
- Kontuur no longer holds my billing email address → Zurich's balance must be €0.00 (6.12); Stripe
  Dashboard → Zurich's customer → edit → clear the email → save (07 N14 step 1). If the Dashboard will not
  save a customer without an email, the scenario is not testable by hand. It leaves a document that the
  daily tick retries, and logs, every day.
- Kontuur gave me half off my next month → Stripe Dashboard → Product catalogue → Coupons → New: 50 % off,
  duration Once; Burgas's subscription → Update subscription → add it → save (07 N48 steps 1–2). Run it
  last in its month, after every other audit-file check of that month: the month's NRA audit file then
  fails for good. If the PDF's line already reads €14.50, the scenario passes: record that (detailed
  case N48).

## Left to the technical suite

Not covered at all (15):

- D43 · a subscription made in the Stripe Dashboard belongs to no workspace, so no customer sees anything.
- D17 · a replayed notice from Stripe, and Stripe refusing a second credit: nothing a customer does or sees;
  one note and one email per refund is 6.8's "exactly one".
- N7, N16, N17, N18, N19, N20, N24, N26, N27, N30, N46 · the NRA audit file and the undocumented-sales
  check: operator-only.
- N44 · a delivered stamp cleared by SQL: the customer sees nothing (no second email); the stamp and
  Resend's key are operator checks.
- N45 · a delivered document's stamp cleared and its PDF deleted by hand: an operator fault drill; the
  "Unavailable" row is 6.15.

Covered, with parts left behind:

- D3 · the ids on the PDF compared with Stripe's invoice and charge (Stripe Dashboard).
- D6 · the rows each role reads in the SQL editor, the table's one policy and its write grants (database).
- D8, D11, D24, D48 · the stored VAT basis and rate (database); D8/D24/D48's "record it" branches when
  Stripe Tax picks another basis (a Stripe setting).
- D12 · one stored line per Stripe line (database); Qty × Unit against Net on proration rows (accountant).
- D13 · `issued_at` in UTC (database).
- D14 · the webhook answers, the numbers in payment order across workspaces, the gapless series (database).
- D15 · the PDF's Transaction is the succeeded charge, not the 0341 attempt (Stripe Dashboard).
- D16, D18, D20, D51 · the webhook answers and the stored links to the invoice (database).
- D19, D25 · the 500, the event's error text and the unchanged counter.
- D21 · no event reaches Kontuur; the monthly query does not list the refund.
- D22 · the webhook's "undocumented_sale" answer, the error-level log line and the monthly query.
- D23 · the 500 and the event's error row.
- D27, D30 · the 500 on every retry, the event's error and the monthly query.
- D28 · the 200, the unchanged counter and the monthly query; the plan section's "Renews on" moving on,
  a check of every renewal rather than of its documents.
- D29 · the pre-payment note's "ignored" answer, the 500 and the monthly query.
- D31 · the PDFs kept under `unassigned/` (Storage); the "no_workspace" answer.
- D42 · the PDF names the authenticated charge (Stripe Dashboard).
- D44 · the stored tax ids on each document (database).
- D45 · which of Stripe's three shapes happened (webhook answer, amount paid): the defect row.
- D49 · the webhook's answer; the stored PDF's time unchanged by the resend (Storage).
- D50 · the counter moved by exactly 2; a third credit refused by Stripe (Dashboard).
- D54 · no billing event after the refund fails; the stored refund id, delivery and total (database).
- N4 · the link without its token, with a changed character, on the public path, or pointed at another
  workspace's PDF: security checks a customer would not make.
- N9 · the audit file's 500 while the shop number is missing.
- N11 · the 10-minute wait, the retried/delivered counts, a resend while still broken.
- N13 · the sha256 comparison of the stored and mailed PDFs.
- N14 · the daily failure log, the retried-not-delivered count, other documents still delivered, the stored
  error, and that putting the email back changes nothing (database).
- N21, N22, N23 · where the documents are filed in the audit file, and N22's 409.
- N40 · the 500 and its log line; defect D13 (the monthly query misses the sale): operator-only.
- N47 · the webhook's "written" answer; the audit-file filing (order dated the old day, document the 1st,
  the old month's file without it).
- N48 · the audit file's 500 and its log line.
