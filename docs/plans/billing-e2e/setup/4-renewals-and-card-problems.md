# 4 · Renewing my plan, and fixing a payment that failed: setup and coverage

Source: `technical/04-renewal-and-failed-payment.feature`, with the long cases in the detailed R
cases, and R14 (the declined slot raise, D11). Defects: D10 (4.16, a teammate told to update the
card), D11 (4.11, a declined slot raise).

## Covers

- 4.1 ← R5 (R1's paid workspace is its starting state; "Renews on" as a Sofia date)
- 4.2 ← R5 (the invoice email and PDF)
- 4.3 ← R5 (the renewal bills the client slots, not the clients; nothing lowers it beforehand)
- 4.4 ← R9 (the renewal tried on the new card is seen in 4.6, where •••• 0341 declines it)
- 4.5 ← R8 (including the return link landing on Plan & billing)
- 4.6 ← R10 (including no "Renews on" while the payment has failed)
- 4.7 ← R10 (the email and the bell)
- 4.8 ← R11, R45, R43
- 4.9 ← R13
- 4.10 ← R15 (step 4, the slot control's sentence in the grace), and Q21 and Q3 of
  `technical/03-client-slots.feature` (the same sentence; the cap refusal, there outside the grace)
- 4.11 ← R14 (D11; Q14 of `technical/03-client-slots.feature` is the same case), R18 (the card fix
  that would collect its pro-rata invoice). D11 is unconfirmed: it hangs on whether Stripe leaves the
  declined raise's pro-rata invoice open. If 4.11 passes, D11 is settled as not reproduced.
- 4.12 ← R15
- 4.13 ← R42. The banner that asks for the card is only on pages with the sidebar; the Generate page
  has no banner, so its refusal asks for the card itself (4.27).
- 4.14 ← R16
- 4.15 ← R17 (and long case R44: a client's settings are walled too)
- 4.16 ← R39 (D10)
- 4.17 ← R18
- 4.18 ← R20
- 4.19 ← R19 (the "later than" row)
- 4.20 ← R35 (Los Angeles and Sofia rows, and the bell that keeps its old sentence), R45 (the date part)
- 4.21 ← R46, R21, R22
- 4.22 ← R23 (from the paused state; see Setup)
- 4.23 ← R24
- 4.24 ← R36
- 4.25 ← R10 (step 5, the Delete workspace refusal), R36 (Delete workspace offered afterwards)
- 4.26 ← R7 (renewal paid row), R34 (card fixed row), R47 (cancelled row)
- 4.27 ← R42 (the 50 row, on the Generate page)

## Setup

- Run order (follows the technical file's): 4.3 → 4.1 → 4.2 → 4.26 renewal paid → add the client
  back (below) → 4.5 → 4.4 → 4.11 up to its first "When my renewal…" → 4.6 → 4.7 → 4.8 row 1 → 4.9 →
  4.10 → 4.12 → 4.13 → 4.27 → 4.14 → 4.8 row 3 → 4.16 → 4.15 → 4.17 with the rest of 4.11 → 4.26 card
  fixed → lower the slots to 1 (below) → 4.19 → 4.20 Los Angeles → 4.8 row 2 → 4.20 Sofia → 4.18 →
  4.21 (Berlin, then Berlin with VAT ID, then Skopje) → 4.22 → 4.23 → 4.25 with 4.24 → 4.26 cancelled.
- I am the agency owner of "R Clock Test", on Pro, paying by card → R1 steps 1–11: a Stripe test clock
  "R renewal" frozen at the last day of a month, 22:30 UTC; `STRIPE_TEST_CLOCK` set to its id in Vercel
  and redeployed; sign up in agency mode as "R Clock Test"; Settings → Account → Timezone Europe/Sofia;
  2 clients, each with Generate automatically off; invite the teammate; leave "Clients to pay for" at
  2 and Choose plan with 4242 4242 4242 4242, a Bulgarian address, no tax ID; then (after R2) remove
  `STRIPE_TEST_CLOCK` and redeploy. Generate one post so the meters read "1 of 50".
- my plan renews / my plan for 2 client slots has just renewed → test clock → Advance time to 2 hours after
  the subscription's current period end, wait for Ready, reload after 30 s (R5).
- "Renews on" names the day my plan renews next month, as a date in Sofia → with the 22:30 UTC anchor,
  "Renews on" is the next day's Sofia date: period end 30 Nov 22:30 UTC reads "1 December 2026" (R5).
- I have deleted one of my 2 clients (4.3) → in the app, right after R1: delete a client in its
  settings; the dialog says the slot is freed and the bill is unchanged. Nothing is sent to Stripe, and
  no hand edit or clock step is needed before "my plan renews".
- add the client back (after 4.26's renewal paid row) → Clients → Add client, Generate automatically
  off: it takes the free slot, nothing is charged, and Clients reads "2 of 2" for 4.6 onwards.
- a new card (4.4) / my card declines when charged / my card now declines when charged / my card still
  declines → Manage billing → add test card 4000 0000 0000 0341 and make it the default; check in the
  Stripe Dashboard that the subscription's card is •••• 0341 (R9, R19 step 1, R23 step 1).
- my next renewal is tried on the new card (4.4) → seen at 4.6's renewal: •••• 0341 declines it, which
  •••• 4242 would have paid (R9 → R10).
- a card that is declined at once → test card 4000 0000 0000 9995 (R8). The link back to Kontuur is
  the portal's return link, which lands on `/settings?tab=account` (R8 step 4).
- a working card → test card 4242 4242 4242 4242 (R18, R23 step 4).
- a card that asks for 3-D Secure → test card 4000 0025 0000 3155, "Complete authentication" in the
  portal (R20).
- my renewal payment is declined / was declined / was declined today → read the sandbox retry policy
  first (Billing → Revenue recovery → Retries); with •••• 0341 on the subscription, advance the clock to
  2 hours after the period end (R10). Wait a minute and reload twice for the banner.
- the payment is retried and declined again → the open invoice's "Next payment attempt"; check against
  the retry policy that it is not the last retry; advance the clock just past it (R11, R43, R45).
- my 7 days to fix it end in 10 minutes → SQL, test workspace only (R16):
  `update agencies set past_due_since = now() - interval '7 days' + interval '10 minutes'
  where id = :agency_id and subscription_status = 'past_due';`
- my 7 days ran out and my workspace paused / my workspace has paused after my declined renewal / my
  workspace paused after a declined renewal for 2 client slots → the R16 write above, then wait 11
  minutes; on pages other than Settings wait a minute and reload twice.
- 11 minutes have passed → a real wait after the R16 write; reload Plan & billing, and reload other pages
  twice after a minute.
- I have used 49 of my 50 AI drafts this month / I have used all 50 / I have used all 50 of my AI drafts
  this month → SQL, test workspace only (R42), with 49, then 50:
  `insert into usage_counters (agency_id, period, kind, count) select id,
  to_char(current_period_start at time zone 'UTC', 'YYYY-MM-DD'), 'draft', 49 from agencies
  where id = :agency_id and subscription_status = 'past_due'
  on conflict (agency_id, period, kind) do update set count = excluded.count;`
- my renewal payment was declined just after midnight last night, Sofia time → SQL, test workspace only
  (R35, Sofia row), which puts the failure at yesterday 22:30 UTC (01:30 in Sofia until 25 October
  2026, 00:30 after):
  `update agencies set past_due_since = (((now() at time zone 'UTC')::date - 1) + time '22:30')
  at time zone 'UTC' where id = :agency_id and subscription_status = 'past_due';`
- I have set my workspace's timezone to ‹zone› / I have set my timezone to Los Angeles → Settings →
  Account → Timezone America/Los_Angeles (Los Angeles) or Europe/Sofia (Sofia); set it back to
  Europe/Sofia after 4.8 row 2 (R45 step 6), which is 4.20's Sofia row.
- no "Your workspace is paused" bell or email arrives, even the next day → run the billing cron by hand
  (R17 step 4: `curl -sS -H "Authorization: Bearer $CRON_SECRET" https://kontuur.app/api/cron/billing`).
- within 2 minutes my card is charged €69.60 → if the renewal is still Open after 2 minutes, record a
  finding against the email's "The charge is tried again as soon as the card is updated.", then advance
  the clock just past "Next payment attempt" (R18 step 3). Same fallback in 4.11, 4.18 and 4.22.
- my plan for 2 client slots is "Active", and my card declines when charged (4.11) → the state right
  after 4.4 (•••• 0341 is the subscription's card), with most of the period left, so the confirm says
  the raise is charged today (a raise under €0.50 goes on the renewal invoice and charges no card).
  Stop after "no new invoice is listed"; "my renewal is declined later" is 4.6's renewal, and the card
  fix is 4.17's (R18), where the open renewal bills 2 slots, €69.60, though 1 client is left.
- my last declined renewal was paid once I fixed my card → the state after 4.17 (R18).
- a new "A payment failed" bell and a new "Your Kontuur payment failed" email arrive (4.19) → run it on
  a later real UTC day than 4.6's failure; on the same UTC day nothing new arrives (R19, first row).
- lower the slots to 1 (after 4.26's card fixed row) → Plan & billing → "Client slots" − → Change →
  "Remove slot": nothing is charged or refunded, and it reads "You pay for 2 until ‹date›, then 1."
  The renewal in 4.19 then bills 1 slot, €34.80.
- my renewal for 1 client slot was declined → the state after 4.19 (R19: the renewal after the lower
  bills 1 slot).
- I pay for 1 client with a working card (4.21) → the state after 4.18 (•••• 3155 on file).
- Berlin, no tax ID → Manage billing: Musterstraße 1, 10115 Berlin, Germany, no tax ID (R46).
  Berlin, DE VAT ID → the same address, tax ID EU VAT DE123456789 (R21).
  Skopje, no tax ID → tax ID removed, Skopje 1000, North Macedonia (R22).
- my renewal payment was declined, my 7 days ran out, and my card still declines (4.22) → with
  •••• 0341 on file, advance the clock 2 hours past the period end; then the R16 write above and wait
  11 minutes, so the workspace is paused before the next renewal (R23 steps 1–2, then R16).
- a month later my next renewal payment is declined too → advance the clock one more month (+2 hours);
  only if the retry policy keeps a subscription past due for over a month, otherwise skip 4.22 (R23
  step 3).
- Kontuur's last try to charge my card is declined, and my plan is ‹outcome› → advance the clock past
  the last retry (R24). The outcome is whatever the sandbox retry policy does after it, so only one row
  runs: "ended" = the policy cancels the subscription, "kept on hold" = it marks it unpaid, "left as it
  is" = it leaves it past due.
- my card is never charged for the failed renewal, not even days later → after cancelling, advance the
  clock past the invoice's former "Next payment attempt" (R36 step 4). If 4.23 ran its "ended" row,
  4.24 and 4.25 are not applicable: Stripe already ended the plan.
- Stripe sends Kontuur an old message about ‹payment› again, late → SQL, test workspace only, marks
  the two events unprocessed, then Stripe → Webhooks → the endpoint → Resend both:
  `update billing_events set processed_at = null where agency_id = :agency_id and id in ('‹evt›', '‹evt›');`
  Renewal paid row (R7, after 4.1): R1's `invoice.paid` and R5's `customer.subscription.updated`,
  `invoice.paid` first. Card fixed row (R34, after 4.17): a `customer.subscription.updated` whose
  payload status is `past_due` and an `invoice.payment_failed`, the failure first. Cancelled row (R47,
  after 4.24): the last episode's `past_due` subscription update and `invoice.payment_failed`, any
  order. Wait a minute and reload twice before checking.

## Left to the technical suite

- R41: an unknown test clock id set in Vercel; operator configuration, not a customer journey.
- R1: builds the test-clock workspace; its Stripe clock, first-invoice and database checks are
  operator-side, and the customer's first payment is file 2's.
- R2: which Stripe customers join the test clock; Stripe Dashboard only.
- R33: a failed payment on a subscription created by hand in the Stripe Dashboard; operator-only.
- R3: a quantity set by hand in the Stripe Dashboard; operator-only (a customer sets slots in the app).

Checks dropped from the covered IDs (no customer can see them): every webhook answer (`period_paid`,
`written`, `ignored`), every database column (the period, `past_due_since`, `client_slots`, the paid
count, usage buckets, document rows, bell keys), every log line ("reminder emailed" / "suppressed"), and
Stripe Dashboard views (R9 the subscription's card •••• 0341, R10/R16 the open invoice and Past due,
R14/R15 Stripe's quantity staying 2, R14's "no pro-rata invoice left open or draft", R24's stored
status). R14's row check (`client_slots` and the paid quantity still 2) is dropped with the database
columns. Also R20's "record it if the renewal is left needing authentication", R21/R22's 500 answer when
Stripe's tax reason is unknown, R19's same-UTC-day row (a test-clock artefact), and R23's "Payment
failed" with the same banner date across two renewals (a test-clock artefact: the 7 days count real
time, so a customer whose second renewal fails a month later has been paused for three weeks; 4.22
starts paused instead). R42's "no allowance bell" is dropped too: it holds only because the database
edit skips what rings the bell; generating for real up to 40 of 50 rings the "An allowance is nearly
used up" bell.

Detailed cases that the technical file does not carry (not counted above): R6 and R12 (replayed
deliveries), R25 (a renewal charged from the Stripe Dashboard after the workspace was deleted), R26–R31
and R48 (not testable by hand), R32 (a forged request), R37 (a second tab's Cancel, the cancelling
file's journey), R38 and R40 (the clients file's journeys), R44 (folded into 4.15).
