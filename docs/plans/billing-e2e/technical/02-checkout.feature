Feature: Checkout and the first subscription
  A trial chooses the plan and pays in Stripe Checkout.
  It gets its subscription, its workspace row and its first invoice.

  Background:
    Given kontuur.app runs on the Stripe sandbox with STRIPE_TEST_CLOCK unset
    And the price is €29 a month, tax exclusive, with Stripe Tax on for Bulgaria
    And "Logs" means Stripe → Developers → Logs
    And an SQL write hits a test workspace only, then I wait 70 s and load /dashboard twice

  @positive @core
  Scenario: C1 · A fresh trial picks the slots Checkout will bill, and nothing exists in Stripe yet
    Given W1 "C-One" is a fresh agency trial with 1 client
    When I open Plan & billing
    Then "Clients to pay for" reads 1 with "One slot fewer" disabled, and Choose plan is the only plan button
    And it reads "1 client × €29.00 = €29.00 a month excl. VAT" and "A plan pays for at least one client."
    And "One slot more" is disabled at 50, which reads "50 clients × €29.00 = €1,450.00 a month excl. VAT"
    And Invoices reads "No documents yet — the first payment creates one." and Stripe has no customer for W1

  @negative @write
  Scenario: C4 · A member's stale Choose plan click is refused before Stripe is asked
    Given SQL write: W1's member is made admin, and 6 minutes later tab A shows Choose plan
    And SQL write: the member is made member again, and 6 minutes later tab B loads /dashboard
    When the member clicks Choose plan in tab A
    Then the toast reads "Only admins can manage the plan."
    And Logs show no POST /v1/customers and no POST /v1/checkout/sessions

  @negative @write
  Scenario: C5 · A house workspace cannot check out, even from a stale tab
    Given W6 "C-House" is a fresh trial with no Stripe customer, and tab A shows Choose plan
    And SQL write: its plan is house
    When I click Choose plan in tab A
    Then the toast reads "This workspace already has a plan. Manage it in Plan & billing."
    And Logs show no POST /v1/customers and no POST /v1/checkout/sessions
    And afterwards an SQL write sets its plan back to trial

  @positive @core
  Scenario: C6 · Choose plan opens Stripe Checkout exactly as built, for the slots chosen
    Given W1 has no Stripe customer yet; after a reload "One slot more" was pressed twice, to 3
    When I click Choose plan and read Stripe's page without paying
    Then Checkout sells Kontuur × 3 at €29.00 a month, with no trial and no promotion code field
    And it asks for email, card, a required address and an optional tax ID, and requires the tick:
      """
      I ask for the service to start now and understand that
      if I withdraw within 14 days I pay for the days used.
      """
    And Logs show the session's line_items quantity 3 and subscription_data billing_mode flexible
    And Stripe has one customer "C-One" with W1's agency_id, keyed customer:‹W1 id›

  @negative
  Scenario: C7 · A double click opens one session and expires the older one
    Given W1's Checkout tab from C6, session S0, is still open
    When I double-click Choose plan in a new tab
    Then the second click does nothing
    And Logs show one new checkout session, one expire of S0, and no second POST /v1/customers
    When I try to pay in the S0 tab with 4242 4242 4242 4242
    Then Stripe says the session has expired, and nothing is charged

  @negative
  Scenario Outline: C8 · Stripe's page takes no payment while a required field is wrong
    Given <workspace> has an unpaid Checkout open
    When I fill email, card 4242 4242 4242 4242 and <details>
    And I <problem> and press Subscribe
    Then Stripe flags <flagged>
    And no charge, subscription or invoice appears

    Examples:
      | workspace | details                      | problem                      | flagged                  |
      | W1        | a Sofia address              | leave the consent tick empty | the tick-box as required |
      | W1        | the tick                     | clear address line and city  | the address as required  |
      | W6        | Berlin, tick, "C-House GmbH" | give the VAT ID DE123        | the tax ID as invalid    |
      | W6        | Berlin, tick, "C-House GmbH" | give the VAT ID XX123456789  | the tax ID as invalid    |

  @negative
  Scenario: C9 · Leaving Checkout charges nothing and says so once
    Given W1's Checkout session S1 is open and unpaid
    When I click Stripe's back link
    Then the toast reads "Checkout was cancelled — nothing was charged."
    When I reload
    Then no toast shows
    And a new Choose plan click logs an expire of S1, a new session and no new customer

  @negative @core
  Scenario: C10 · Only the newest of two Checkout tabs can be paid
    Given W1 has no subscription
    When I click Choose plan in tab A, session S2, then in tab B, session S3
    Then Logs show tab B's click expiring S2 before creating S3
    When I pay in tab A with 4242 4242 4242 4242, a Bulgarian address and the tick
    Then Stripe says the session has expired or is no longer available
    And no charge, invoice or subscription appears

  @negative @core
  Scenario Outline: C11 · A failed first payment starts no plan
    Given <workspace> has an unpaid Checkout open
    When I pay with card <card> as <payer>, choosing Fail if 3-D Secure asks
    Then Stripe shows <refusal> and stays open for another card
    And Plan & billing still shows Trial and Choose plan
    And Stripe holds no subscription, not even Incomplete
    And no workspace is incomplete
    # sql: select id from public.agencies
    #      where subscription_status in ('incomplete', 'incomplete_expired');  -- no rows
    # W2 "C-Three" is an agency trial with 3 clients; "Clients to pay for" starts at 3.

    Examples:
      | ID  | workspace    | card                | payer                             | refusal            |
      | C11 | W1, tab B S3 | 4000 0000 0000 9995 | a Sofia consumer, tick            | insufficient funds |
      | C12 | W1, tab B S3 | 4000 0000 0000 0341 | a Sofia consumer, tick            | a decline          |
      | C22 | W2, 3 slots  | 4000 0025 0000 3155 | C-Three GmbH, Berlin, DE123456789 | failed 3-D Secure  |

  @positive @core
  Scenario: C13 · A Bulgarian consumer pays with a good card
    Given W1's Checkout S3 is open, and tab C shows Plan & billing, not reloaded
    When I pay with 4242 4242 4242 4242 as "Test Consumer", ul. Test 1, Sofia 1000, tick ticked
    Then Stripe returns me to Plan & billing with &billing=success
    And the subscription is Active, quantity 1, billing_mode flexible, €29.00 a month, agency_id metadata
    And its invoice is paid: 1 × €29.00 + VAT 20 % €5.80 = €34.80
    And every delivery answers 200: first "started", invoice.paid "period_paid", later "written"

  @positive @core @defect-D2
  Scenario: C14 · The return card confirms the plan, then leaves on its own
    Given W1 has just paid in C13, on the page Stripe returned to
    When I watch the area under the tabs for 20 seconds, then reload
    Then the address bar drops &billing=success at once
    And the card reads "You’re on Pro": Active, Clients 1, €29.00 excl. VAT, Renews ‹Sofia date›
    And the card fades after about 8 s and does not return after the reload
    But a card starting at "Payment received" · "Activating" may vanish at ~3 s: record which

  @positive @core
  Scenario: C15 · The webhook's first fill of the workspace row
    Given W1 has paid in C13
    When I reload Plan & billing
    Then it shows Pro, Active, "Renews on" the period end, Clients "1 of 1", 0 of 25, 0 of 105, 0 of 15
    And "Client slots" reads 1 with Cancel plan and Manage billing, no Change and no Choose plan
    And the row keeps plan trial, the sub_…, active, Stripe's period, client_slots 1, subscription_quantity 1
    And every billing event for this customer is processed with no error
    # sql: select plan, stripe_subscription_id, subscription_status, current_period_end,
    #      client_slots, subscription_quantity from public.agencies where id = '‹W1 id›';
    # sql: select type, processed_at, error from public.billing_events
    #      where payload -> 'data' -> 'object' ->> 'customer' = '‹W1 cus_…›';

  @positive @core
  Scenario: C16 · The first invoice is issued, stored and emailed once
    Given W1 has paid in C13
    When I reload Plan & billing and open the mailbox typed at Checkout
    Then Invoices lists one row: ten-digit number, Invoice, today in Sofia, €34.80, Download
    And one email "Your invoice from Kontuur" arrives, with kontuur-‹number›.pdf
    And the PDF shows Chelling Ltd, VAT BG206770508, tax group Б, VAT 20 % €5.80, total €34.80
    And the QR reads ‹e-shop no.›*‹invoice id›*‹charge id›*‹YYYY-MM-DD›*‹HH:MM:SS›*34.80

  @negative @core
  Scenario: C17 · After payment, replayed events and a stale Choose plan change nothing
    Given W1 is paying, and tab C still shows Choose plan from before C13
    When I resend W1's subscription.created and invoice.paid from Workbench → Events
    Then both answer 200 {"received":true,"duplicate":true}
    And there is still one document, one Invoices row and one email
    When I click Choose plan in tab C
    Then the toast reads "This workspace already has a plan. Manage it in Plan & billing."

  @negative @core
  Scenario: C19 · A second subscription made by hand for a paying workspace is refused as a conflict
    Given W1 is paying
    When I add a second sub to W1's customer: €29, quantity 1, 30-day trial, agency_id = W1
    Then its subscription.created and any €0 invoice.paid answer 200 "conflict"
    And Vercel logs "…: conflict — sub_‹new› arrived while sub_‹W1's› is open; nothing written"
    When I cancel that second subscription immediately
    Then it answers 200 "ignored", and the row keeps the first sub_… active

  @edge
  Scenario: C23 · An EU business buys 3 slots for its 3 clients through 3-D Secure, reverse charged
    Given W2 holds 3 clients, and its C11 Checkout is still open for 3 slots as "C-Three GmbH"
    When I press Subscribe with card 4000 0025 0000 3155 and choose Complete authentication
    Then the return card reaches "You’re on Pro" with Clients 3 and €87.00 excl. VAT
    And Plan & billing shows Clients "3 of 3" and 0 of 75, 0 of 315, 0 of 45
    And Stripe's invoice is 3 × €29.00 = €87.00 with €0.00 VAT, reverse charge, paid
    And the document is reverse_charge, 0 %, 8700 cents, with the tax ID DE123456789
    # sql: select client_slots, subscription_quantity from public.agencies
    #      where id = '‹W2 id›';  -- 3 · 3

  @edge
  Scenario: C24 · A solo customer outside the EU buys its one business, €29.00 with no VAT
    Given W3 "C-Solo" is a solo trial with its one business and no Stripe customer
    And Plan & billing shows "€29.00 a month excl. VAT for your business" and Choose plan, no stepper
    When I choose a plan and pay with 4242 4242 4242 4242 as a consumer in New York, US
    Then the return card reaches "You’re on Pro" with Business 1 and €29.00 excl. VAT
    And Plan & billing shows Business "1 of 1", 0 of 25, 0 of 105, 0 of 15, and still no stepper
    And Stripe's invoice is 1 × €29.00 with no VAT, paid, and the document is outside_eu

  @edge @write
  Scenario: C28 · A trial in its grace, and a paused one, can still choose a plan
    Given W8 "C-Lapsed" is a 1-client trial, and SQL write: its trial ended 3 days ago
    Then Plan & billing shows the grace sentence, Trial ended, a red pause date and Choose plan
    When SQL write: its trial ended 10 days ago, and I open /dashboard
    Then /dashboard shows the "Workspace paused" wall, and Plan & billing shows Paused
    When I pay with 4242 4242 4242 4242 as a Bulgarian consumer
    Then Plan & billing shows Active, renewing one month from payment, and /dashboard has no wall

  @negative @defect-D2
  Scenario: C29 · While the webhook is late, the return card waits and a second Checkout is refused
    Given W7 "C-Late" is a 1-client trial, and the kontuur.app webhook destination is disabled
    When I pay with 4242 4242 4242 4242 as a Bulgarian consumer and watch the card for 70 s
    Then it reads "Payment received" · "Activating", then "Pending" after about a minute
    But it may vanish at the first refresh, about 3 s in: record which, with the seconds
    When I click Choose plan
    Then the toast reads "Your plan is being activated — it appears here in a few seconds."

  @edge
  Scenario: C30 · Late, out-of-order events still write one correct first fill
    Given W7 paid in C29 with no event delivered
    When I enable the destination and resend invoice.paid, subscription.updated, subscription.created
    Then invoice.paid answers 200 "started", and the subscription events answer 200 "written"
    And Plan & billing shows Pro, Active, Clients "1 of 1" and one €34.80 Invoices row
    And the row matches C15, with one document and one email

  @edge @defect-D1
  Scenario: C32 · A Checkout paid after its workspace was deleted gets its invoice, and keeps billing
    Given W9 "C-Gone" is a trial with its Checkout open in tab A
    When I delete the workspace in tab B, then pay in tab A with 4242 4242 4242 4242
    Then the payment succeeds, and the return sends me to sign-in
    And subscription.created and invoice.paid answer 200 "no_workspace"
    And one €34.80 invoice email arrives with no Open Plan & billing button
    But the subscription stays Active and renews monthly: nothing in the app cancels it

  @negative
  Scenario: C34 · A credit on the first invoice gets no document, yet the return card promises one
    Given W10 "C-Credit" is a 1-client trial whose Stripe customer has a €5.00 credit
    When I choose a plan and pay with 4242 4242 4242 4242 as a Bulgarian consumer
    Then Stripe's invoice is €34.80 with −€5.00 applied balance and €29.80 paid
    And invoice.paid answers 500 {"error":"Event failed"} on every retry, and no email arrives
    And Plan & billing shows Pro, Active and "No documents yet — the first payment creates one."
    But the return card at "You’re on Pro" still reads "Your invoice is on its way by email…"

  @negative @core
  Scenario: C36 · A misconfigured price sells nothing
    Given W6 is back on trial, and STRIPE_PRICE_ID is a tax-inclusive €29 monthly price, redeployed
    When I click Choose plan
    Then the toast reads "Could not open Stripe just now. Please try again in a moment."
    And Vercel logs:
      """
      …bills 2900 eur every 1 month with tax inclusive, not 2900 eur a month with tax exclusive
      """
    When I restore STRIPE_PRICE_ID, redeploy and click Choose plan
    Then Checkout opens normally, on the same customer

  @edge
  Scenario: C44 · The last client deleted while Checkout is open: the plan pays for one empty slot
    Given W15 "C-Last" is a 1-client trial with its Checkout open for 1 slot
    When I delete the client in another tab, then pay with 4242 4242 4242 4242
    Then Plan & billing shows Pro, Active, Clients "0 of 1", and "Client slots" 1
    And "One slot fewer" is disabled, over "Room for 1 more client before you need another slot."
    And Stripe holds quantity 1 with a paid €34.80 invoice, and the row has client_slots 1
    And adding one client reads "1 of 1", charges nothing and sends no POST /v1/subscriptions/‹id›

  @negative
  Scenario Outline: C45 · The return flag alone decides what Plan & billing shows
    Given <workspace>, signed in as its admin
    When I open /settings?tab=account&billing=<flag> by hand
    Then I see <shown>
    And the address bar <bar>, Logs show no request, and the row is unchanged

    Examples:
      | workspace      | flag      | shown                              | bar                |
      | W6, never paid | success   | "Payment received" · "Activating"  | drops the flag     |
      | W1, paying     | success   | "You’re on Pro", old invoice line  | drops the flag     |
      | W1, paying     | cancelled | the cancelled toast and no card    | drops the flag     |
      | W1, paying     | paid      | nothing                            | keeps billing=paid |

  @negative @write @defect-D4
  Scenario: C47 · A hand-deleted Stripe customer blocks Checkout, and clearing the row fails for a day
    Given W13 "C-Deleted" opened and left Checkout once, then its customer was deleted in Stripe
    When I click Choose plan, then SQL-clear stripe_customer_id and click again within 24 hours
    Then both clicks toast "Could not open Stripe just now. Please try again in a moment."
    And the deleted cus_… is written back to the row
    When I clear it again and click Choose plan over 24 hours after the first click
    Then a new customer with W13's agency_id is made, and Checkout opens

  @edge @defect-D5
  Scenario: C53 · Two tabs click Choose plan at the same moment
    Given W14 "C-Race" has session S0 open, and Plan & billing in windows A and B
    When I click Choose plan in A and, within half a second, in B, without paying
    Then one window shows "Could not open Stripe just now…", and Logs show one new session
    But if both reach Stripe with two new sessions about a second apart, record it as the gap
    When I click Choose plan in a third tab, back out, and try to pay in A and B
    Then Stripe says both sessions have expired, and nothing is charged

  @edge
  Scenario: C39 · After the whole run, no customer, claim, invoice or event is left wrong
    Given every other C scenario has run
    Then no Stripe customer id belongs to two workspaces
    # sql: select stripe_customer_id, count(*) from public.agencies
    #      where stripe_customer_id is not null group by 1 having count(*) > 1;  -- no rows
    And each workspace's Stripe customer carries its agency_id; only C47 made a second one
    And every paid workspace has client_slots, and none holds a slot-change claim over 70 s old
    # sql: select id from public.agencies where (stripe_subscription_id is not null
    #      and client_slots is null) or quantity_sync_at < now() - interval '70 seconds';  -- no rows
    And no Stripe invoice has two invoice documents
    # sql: select stripe_invoice_id, count(*) from public.sale_documents
    #      where kind = 'invoice' group by 1 having count(*) > 1;  -- no rows
    And the only failed delivery and unprocessed event is C34's invoice.paid
    # sql: select type, id, error from public.billing_events where processed_at is null;
