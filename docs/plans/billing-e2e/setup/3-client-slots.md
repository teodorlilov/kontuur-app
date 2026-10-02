# 3 · Client slots: setup and coverage

Customer-level scenarios in `3-client-slots.feature`, the client-slot model of
`docs/plans/CLIENT-SLOTS.md`: the admin chooses how many clients to pay for, the slots cap the
clients, and creating or deleting a client never reaches Stripe. Technical source:
`technical/03-client-slots.feature` (Q IDs). Defect: D11 (3.16, a declined slot raise,
unconfirmed); D7 (3.29) is fixed. D3, D8 and D9 went with the old per-client model: a paid
workspace with no clients now simply holds one slot (3.2, 3.10), a plan set to end says why its
slots cannot change and its delete dialog names no bill (3.18), and a paid solo workspace is
refused a second business (3.30).

## Covers

- 3.1 ← Q1
- 3.2 ← Q29
- 3.3 ← Q26 (Plan & billing and the payment)
- 3.4 ← Q1 (row 1, the trial's floor), Q29 (row 2), Q11 (row 3, the floor's sentence on a running
  plan), Q30 (row 4, the floor at one client); the stepper stops at 50 (`MAX_CLIENT_SLOTS`), the
  bound the action itself re-checks in Q18
- 3.5 ← Q4, Q31 row 1 (the domestic invoice email)
- 3.6 ← Q31 rows 2 and 3
- 3.7 ← Q23; its last step is seen at Q24's renewal (3.20)
- 3.8 ← Q3
- 3.9 ← Q10
- 3.10 ← Q30
- 3.11 ← Q33
- 3.12 ← Q5 (the confirm and the toast)
- 3.13 ← Q5 (the line about the lower, the allowance kept, the cap at once)
- 3.14 ← Q7 (row 2 restores below what was paid for, as Q7 row 2 does)
- 3.15 ← Q9
- 3.16 ← Q14 (D11); row 2 is the card fix with no new raise, the half 4.11 also watches
- 3.17 ← Q21
- 3.18 ← Q20
- 3.19 ← Q22
- 3.20 ← Q24
- 3.21 ← Q13 (the "changed in another window" answer, made one window after the other), Q16 (the
  refused change rewrites the count, so window B's reload shows Stripe's)
- 3.22 ← Q11
- 3.23 ← Q12
- 3.24 ← Q35, Q34
- 3.25 ← Q25
- 3.26 ← Q36
- 3.27 ← Q2
- 3.28 ← Q6
- 3.29 ← Q39
- 3.30 ← Q26 (the second business)
- 3.31 ← Q27
- 3.32 ← Q32

## Setup

Workspaces and logins are the technical file's: W1 "QA Clients" (admin A, member M invited from
Settings → Team as Member, timezone Europe/Sofia), W2 "QA Solo", W3 "QA Zero", W4 "QA Window+",
W5 "QA Clock", W6 "QA Window−"; "C-Three" comes from file 2. Every SQL write below is on the named
test workspace only. Plan & billing and the slot action read the row straight from the database, so
reload Plan & billing right after a write; other pages may show the old row for up to 70 s (wait,
then reload twice).

- pay as a Bulgarian consumer / a Bulgarian consumer → a Bulgarian address, no business option,
  4242 4242 4242 4242, the consent tick ticked.
- I press + beside it / beside "Client slots" → the stepper's + button ("One slot more" to a screen
  reader); − is "One slot fewer". "Change" appears only once the number differs from the slots held.
- add a slot / add a client slot → + beside "Client slots", then "Change", then "Add slot" in the
  dialog. Run 3.5, 3.15 and 3.16 with most of the period left: a one-slot raise under about 13 hours
  before the renewal goes on the renewal invoice instead (3.7).
- "QA Clients" on the trial with 2 clients (3.1, 3.4 row 1, 3.28 row 1, 3.31) → a fresh agency
  sign-up, Settings → Account → Timezone "Europe/Sofia", 2 clients, member M invited and accepted.
- the slot count up to 50 on a paid plan (3.4 rows 3 and 4) → "Change" appears at 50; do not press
  it, reload the page to put the stepper back.
- "QA Zero", with no clients yet (3.2, 3.4 row 2) → a fresh agency sign-up with no client. Its trial
  may have ended (Q28/Q29 run it from the trial's grace): the slot control is the same.
- a teammate in "QA Zero" (3.29) → invite member M3 after 3.10, when QA Zero is paid with no clients.
- which paid at Checkout as an EU business with a VAT ID (3.6 row 1) → "C-Three" after file 2's 2.11:
  C-Three GmbH, Berlin, DE123456789, 3 clients in 3 slots (Q31 row 2, C23). It paid with the 3-D
  Secure card 4000 0025 0000 3155, so first "Manage billing" → add 4242 4242 4242 4242 and make it
  the default; a raise on the 3-D Secure card is Q15's, left to the technical suite.
- "QA Abroad", which paid at Checkout as a customer outside the EU (3.6 row 2) → a fresh agency
  sign-up with 1 client; "Choose plan" at 1, paid with "1 Test Ave", New York, NY 10001, United
  States, no business option, 4242 (Q31 row 3). Not file 2's "C-Solo": a solo workspace has no slots
  to add.
- "QA Clock" / my plan renews in under 12 hours (3.7) → W5 is the one workspace made while Vercel's
  `STRIPE_TEST_CLOCK` is set, on a test clock frozen one month minus about 6 hours before now: sign
  up, add 1 client, pay for 1 slot as a Bulgarian consumer, then unset the variable and redeploy;
  advance the clock to the real present, so under 12 hours are left both on the clock and in real
  time (Q23). With about 6 hours left the raise is about €0.24 net.
- the "Add 1 client slot" dialog open (3.20) → right after 3.7, + to 3 and "Change"; leave the dialog
  open. Run 3.20 within the hours 3.7 leaves before the period end in real time, or the page refuses
  on its own (3.19's sentence) instead (Q24).
- my plan starts renewing, before its payment goes through (3.20) → test clock → advance 30 minutes
  past the subscription's current period end; Stripe's renewal invoice must still be Draft (Q24).
- my renewal is paid (3.20) / my renewal then charges me once (3.7) → advance 2 more hours, wait for
  Ready, then 30 s. The renewal invoice holds the proration lines and 2 × €29.00 (Q24). Its new period
  starts in the real future (a test-clock artefact): raise nothing more on QA Clock afterwards.
- my default card declines (3.16) → "Manage billing" → add 4000 0000 0000 0341 and make it the
  default (Q14). a working card → make 4242 4242 4242 4242 the default again.
- one charge and one invoice email, no more / no charge and no invoice email, ever (3.16) → watch the
  card's charges and the mailbox for an hour. "Manage billing" lists no invoices (its invoice history
  is off), so an invoice the declined raise left open (D11) shows only as a second charge and a second
  "Your invoice from Kontuur" email. Row 2 runs on W4 after 3.26.
- my renewal payment was declined (3.17) → SQL write (Q21):
  `update agencies set subscription_status = 'past_due', past_due_since = now() where id = :agency_id;`
  It changes only what Kontuur reads; Stripe stays active. File 4 (4.10, 4.17) runs the real decline.
- my payment goes through (3.17) → SQL write:
  `update agencies set subscription_status = 'active', past_due_since = null where id = :agency_id;`
- I pressed "Cancel plan" and confirmed it (3.18) → Plan & billing → "Cancel plan" → confirm. In the
  delete dialog press "Cancel"; nothing is deleted. Press "Keep plan" at the end (Q20).
- with + pressed beside "Client slots" in a second tab (3.19) → note the old value
  (`select current_period_end from agencies where id = :agency_id;`), then SQL write (Q22):
  `update agencies set current_period_end = now() + interval '3 minutes' where id = :agency_id;`
  At once open Plan & billing in tab 2 (it must load after the write) and press + once.
- my renewal date passes before its payment has gone through (3.19) → wait until those 3 minutes have
  passed, with no reload of tab 2. Once my renewal is paid → SQL write `current_period_end` back to the
  noted value, then reload.
- with "Client slots" at 4, and Plan & billing open in two windows (3.21) → load Plan & billing in
  both before changing anything. Window B may redraw at 5 by itself after its refusal; the reload
  confirms it.
- another change to my plan is still in progress (3.23) → SQL write (Q12):
  `update agencies set quantity_sync_at = now() + interval '1 hour' where id = :agency_id;`
  The refusal comes within seconds; the dialog stays open.
- that change has been stuck for 5 minutes (3.23) → SQL write:
  `update agencies set quantity_sync_at = now() - interval '5 minutes' where id = :agency_id;`
  No reload: press "Add slot" again in the same dialog. Afterwards `quantity_sync_at` reads null.
- with 2 clients in 7 client slots, window A pressed − down to 2 (3.22) → after 3.18, delete one
  client; open Plan & billing in window A and press − until it stops at 2; then add a client in
  window B (Q11).
- a client named "Acme Studio" (3.11) → rename one of W1's clients on its Basic info tab.
- a new client filled in two tabs (3.27) → open the new-client address in two tabs and fill both up
  to "Save client →". The race is timing: if both refuse, the third press saves one (Q2).
- on the trial with ‹n›, and Checkout open for ‹n› (3.25) → "Choose plan" with "Clients to pay for"
  left at the client count; keep Stripe's Checkout open in tab 1, add or delete in tab 2, then pay in
  tab 1 (Q25). W4 starts with 1 client and adds two (its trial allows 3); W6 has 3 after 3.27 row 1.
- Plan & billing shows Clients "3 of 1" in red (3.26) → W4 straight after 3.25 row 1 (Q36). Open the
  "Delete client" dialog only to read it: press "Cancel".
- Kontuur has put us on its internal plan (3.31) → W1 on its trial with 2 clients and no Stripe
  customer, before 3.1. SQL write: `update agencies set plan = 'house' where id = :agency_id;`
  Afterwards `set plan = 'trial'`, and check Plan & billing shows "Clients to pay for" again.
- holding the settings address of the business in "QA Solo" (3.32) → read-only:
  `select c.id from clients c join agencies a on a.id = c.agency_id where a.name = 'QA Solo';`
  then open https://kontuur.app/clients/‹id›/edit.

Run order, by workspace:

- W1: 3.28 row 1, 3.31, 3.4 row 1, 3.1, 3.27 row 2, 3.8, 3.4 row 3, 3.5, 3.28 row 2, 3.24, add a
  4th client, 3.11, 3.9, 3.12, 3.13, 3.14 row 1, lower to 3, 3.15, lower to 3, 3.14 row 2, 3.21,
  3.23, 3.16 row 1, 3.17, 3.19, 3.18, delete a client, 3.22, 3.32.
- W3: 3.4 row 2, 3.2, 3.4 row 4, 3.10, invite M3, 3.29. W2: 3.3, 3.30.
- W6: 3.27 row 1, 3.25 row 2. W4: 3.25 row 1, 3.26, 3.16 row 2. W5: 3.7, 3.20.
- C-Three: 3.6 row 1. QA Abroad: 3.6 row 2.

## Left to the technical suite

- Q8 — database-only: the table privileges on `clients`.
- Q13's simultaneous half (two windows confirming within a second) — the customer sees one of the
  sentences 3.21 and 3.23 already show; what it proves (one invoice, no credit, a balance of €0.00)
  is visible only in Stripe.
- Q15 — a slot raise on a card whose bank asks to confirm every payment (4000 0027 6000 3184), refused
  whole with "Your bank asked to confirm this payment, which Kontuur cannot take yet. …", then 3.5's
  journey on a card set up for 3-D Secure; file 4's 4.18 covers such a card charged without the
  customer present.
- Q16 — starts with a hand edit of the stored slot count; the customer sees 3.21's refusal.
- Q17 — starts with an operator setting 60 slots in the Stripe Dashboard.
- Q18 — replayed requests from the browser console; a customer only has the stepper (3.4).
- Q19 — needs a database trigger to make the row write fail.
- Q28 — the ended trial's Add client refusal; file 1's 1.14 covers it.

Checks dropped from the covered scenarios, because only Stripe, the database or a log shows them:
Stripe's requests and their proration setting (`always_invoice`, `create_prorations`, `none`), the
subscription's billing mode, the stored ordered and paid counts and the claim column, webhook
answers, document fields (`vat_basis`, `vat_rate`), and the customer balance.
