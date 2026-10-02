Feature: Cancel, re-subscribe, delete the workspace
  An admin ends a plan, takes a new one, or deletes the workspace.
  Stripe, the invoices and every login follow.

  # Run order: W1 X1 X2(X2) X3 X4 X5 X2(X6) X7(X7) X8 X10 X11 X12 X2(X14) X15, fail renewal as in R10,
  #   X7(X37), cancel as in R36, X22 X23 X24 X25 · W2 X26 X39 X38 X27 X40 · W3 X33 X34 X41 X35

  Background:
    Given STRIPE_TEST_CLOCK points at a fresh Stripe test clock, redeployed
    And W1 "X Test One" is an agency with admin A, member M and 2 clients
    And W2 "X Test Two" is an agency with admin B and 1 client
    And W3 "X Test Solo" is a solo workspace with admin C

  @positive @core
  Scenario: X1 · Cancelling a healthy plan sets it to end on the renewal date
    Given W1 is Active with "Renews on" D, and Plan & billing is open in tabs A and B
    When A confirms Cancel plan's dialog "Your plan ends on D. You keep full access until then; …" in tab A
    Then the toast reads "Your plan is set to end."
    And without a reload the row reads "Ends on" D, with Keep plan
    And every page shows the banner "Your plan ends on D — renew in Plan & billing to keep generating."
    And Stripe shows the subscription Active and "Cancels D", with no charge

  @negative
  Scenario Outline: X2 · A stale Keep plan or Cancel plan button is refused, and Stripe is not called
    Given tab <tab>, not reloaded since <since>, still shows <button>
    And the plan is now <state>
    When A clicks <button>
    And in any dialog A <confirm>
    Then one red toast reads "<message>"
    And Stripe and the row are unchanged

    Examples:
      | ID  | tab | since | button      | state   | confirm         | message                             |
      | X2  | B   | X1    | Cancel plan | ending  | double-confirms | There is no running plan to cancel. |
      | X6  | A   | X4    | Keep plan   | running | —               | Your plan is not set to end.        |
      | X14 | C   | X11   | Keep plan   | ended   | —               | Your plan is not set to end.        |
      | X14 | E   | X11   | Cancel plan | ended   | confirms        | There is no running plan to cancel. |

  @positive
  Scenario: X3 · Once the plan is set to end, Delete workspace is offered and its dialog names the end date
    Given W1's plan is set to end on D
    When A opens Settings → Account and clicks Delete workspace
    Then the dialog lists 2 clients, 2 members, their accounts, and every post, image and report
    And it says issued invoices are kept for ten years
    And it ends "Your plan ends on D."
    And Delete permanently stays disabled while "Type X Test One to confirm" is empty

  @negative
  Scenario: X4 · The typed name gates the delete in the browser, and again on the server
    Given W1's plan is set to end, and the delete dialog is open in tab A
    When A types "X Test On", then "  x test   one " instead
    Then Delete permanently goes from disabled to enabled
    When tab B renames the workspace "X Test One Renamed", and A clicks Delete permanently
    Then the red toast reads "The name does not match.", and nothing is deleted
    And tab B renames it back to "X Test One"

  @positive @core
  Scenario: X5 · Keep plan undoes the cancel in one click
    Given W1's plan is set to end on D, and tab A is left as it is
    When A reloads tab B and clicks Keep plan
    Then no dialog opens, and the toast reads "Your plan continues."
    And without a reload the row reads "Renews on" D, and the banner is gone
    And the Danger zone reads "Cancel your plan first, under Plan & billing. …"
    And Stripe shows the subscription no longer cancelling

  @negative @core
  Scenario Outline: X7 · A stale delete dialog is refused on the server while a plan still runs
    Given tab <tab> still offers Delete workspace from <since>
    And the plan is now <state>, and W1 has a pending invite
    When A types "X Test One" and clicks Delete permanently in tab <tab>
    Then the red toast reads "Cancel your plan first, under Plan & billing. <rest>"
    And after a reload tab <tab> shows <status> with Cancel plan
    And Stripe receives nothing, and the workspace, clients, members and invite remain

    Examples:
      | ID  | tab | since           | state    | status         | rest                             |
      | X7  | A   | X4              | running  | Active         | You keep access until it ends, … |
      | X37 | S   | when set to end | past due | Payment failed | It ends at once and …            |

  @negative @write
  Scenario: X8 · A demoted admin's open delete dialog is refused
    Given W1 is Active, and A cancelled the plan and typed "X Test One" in the delete dialog
    And an SQL write makes A a member
    When A clicks Delete permanently without reloading
    Then the red toast reads "Only admins can delete the workspace.", and nothing is deleted
    When an SQL write makes A admin again, and A reloads and clicks Keep plan
    Then the toast reads "Your plan continues."
    # sql: update users set role = 'member' where id = ':admin_user_id' and agency_id = :agency_id;

  @edge
  Scenario Outline: X10 · Billing dates show in the workspace's timezone, not in UTC
    Given W1 is Active and not set to end
    When A sets Timezone to <zone> and saves
    Then "Renews on" and the Cancel dialog's "Your plan ends on …" show the SQL date for <zone>
    And Stripe and the billing columns are unchanged
    # sql: select (current_period_end at time zone '<zone>')::date from agencies where id = :agency_id;

    Examples:
      | zone             |
      | Pacific/Auckland |
      | Pacific/Honolulu |
      | Europe/Sofia     |

  @edge @clock
  Scenario: X11 · Cancelling an hour before the renewal: the renewal never bills
    Given W1 is Active, not set to end, and its clients, posts, members and documents are counted
    When the clock is advanced to 1 hour before the period end
    And A opens spare tab E, cancels the plan in the main tab, then opens spare tab C
    Then the row reads "Ends on" D
    When the clock is advanced to 1 hour after the period end
    Then Stripe shows the subscription Canceled at D, with no invoice, charge or invoice.paid for D

  @positive
  Scenario: X12 · When the plan runs out, the workspace pauses, keeps everything, and sends no bell or email
    Given W1's plan ran out in X11
    When A opens the home page, and M opens any page
    Then each shows the wall "Your workspace is paused. Choose a plan …", with no banner
    And the clients, posts, members and documents match the counts from X11
    When the billing cron runs
    Then W1 gets no paused, trial-ended or payment-failed bell or email

  @positive @core @clock
  Scenario: X15 · Re-subscribing after the plan ended starts a fresh period with nothing stale carried over
    Given W1 is paused with 2 clients in Europe/Sofia, and the clock is at 22:30 UTC the next day
    When A keeps "Clients to pay for" at 2 and pays Checkout with 4242 from Sofia, with no tax ID
    Then the return card reaches "You’re on Pro", Clients 2, "€58.00 excl. VAT", naming no old invoice
    And Plan & billing shows Active, Client slots 2, "Renews on" the Sofia date, the day after the UTC date
    And Stripe has a new Active subscription, quantity 2, on the same customer, its €69.60 invoice paid
    And one new document: domestic, 20 %, 5800 + 1160 = 6960

  @edge
  Scenario: X22 · Re-subscribing after a failed plan was cancelled carries no old debt
    Given W1's plan was cancelled during a failed renewal, with invoice :open_invoice_id unpaid
    When A keeps "Clients to pay for" at 2 and pays Checkout with 4242 as a Berlin business, VAT DE123456789
    Then Plan & billing shows Active with no banner, and Client slots 2
    And Stripe's new first invoice is €58.00 reverse charge, starting balance €0.00
    And :open_invoice_id is still unpaid, and the new card was not charged for it
    And the row holds the new subscription: active, no past_due_since, client_slots 2, paid quantity 2

  @edge
  Scenario: X23 · A plan cancelled in the Stripe Dashboard is followed: the workspace pauses
    Given W1 is Active with 2 client slots paid for, both clients since deleted, Stripe quantity still 2
    When the subscription is cancelled Immediately in the Stripe Dashboard, with no refund
    Then Plan & billing shows Paused, "0 clients", and "Clients to pay for" at 1 with Choose plan
    And it reads "1 client × €29.00 = €29.00 a month excl. VAT", and the home page is walled
    And customer.subscription.deleted answers 200 "written", with no credit note or refund
    And the row shows canceled, with client_slots and subscription_quantity still 2

  @edge
  Scenario: X24 · Re-subscribing on the same clock day with no clients bills one and shares that day's usage
    Given W1 is paused with 0 clients, the clock unmoved since X22
    When A keeps "Clients to pay for" at 1 and pays Checkout with 4242 from New York, United States
    Then Plan & billing shows Active, Clients "0 of 1", Client slots 1, and limits 25 / 105 / 15
    And the used figures are what X22's plan used today
    And Stripe's new subscription has quantity 1, its €29.00 first invoice paid with no VAT
    And the row's period key matches X22's, and the new document is outside_eu
    # sql: select (current_period_start at time zone 'UTC')::date from agencies where id = :agency_id;

  @edge @clock
  Scenario: X25 · Stripe's live status decides the cancel, even while the page still says the plan is healthy
    Given W1 has 0341 as its default card, and the webhook endpoint is Disabled
    And the clock is 2 hours past the period end, Stripe shows Past due, and the page shows Active
    When A confirms the healthy dialog "Your plan ends on ‹D›. You keep full access until then; …"
    Then the toast reads "Your plan has ended.", and the panel shows Paused
    When the endpoint is enabled and the missed events are resent, newest first
    Then the workspace stays Paused, with no "A payment failed" bell or email

  @edge
  Scenario: X26 · Cancelling a plan Stripe already ended, while the row lags, fails safely
    Given the webhook endpoint is Disabled
    And W2's plan was cancelled Immediately in the Stripe Dashboard
    When B reloads Plan & billing, still Active, and confirms Cancel plan
    Then the red toast reads "Could not open Stripe just now. Please try again in a moment."
    When the endpoint is enabled and customer.subscription.deleted is resent
    Then after a reload the panel shows Paused and Choose plan

  @edge
  Scenario: X39 · A subscription made by hand in the Stripe Dashboard does not reopen a paused workspace
    Given W2 is paused with 1 client and the 4242 card on its customer
    When a €29 subscription, quantity 1, no metadata, is made by hand on W2's customer and charged
    Then its events answer 200 "ignored" and "undocumented_sale"
    And Plan & billing still shows Paused and Choose plan
    When B clicks Choose plan
    Then the red toast reads "Your plan is being activated — it appears here in a few seconds."

  @edge
  Scenario: X38 · A cancel set in the Stripe Dashboard shows as "set to end", and Keep plan undoes it
    Given W2 re-subscribed through Checkout and is Active with "Renews on" E
    When the Stripe Dashboard sets it to cancel "At the end of the current period"
    Then after a reload Plan & billing shows "Ends on" E with Keep plan, and the ends-on banner
    And the delete dialog ends "Your plan ends on E."
    When B clicks Keep plan
    Then the toast reads "Your plan continues.", and the row reads "Renews on" E

  @positive @core
  Scenario: X27 · Deleting a workspace set to end removes it and every login, keeps invoices and events
    Given B cancelled W2's plan to end on E, and a private window shows W2's Plan & billing as B
    When B types "X Test Two" in Delete workspace and double-clicks Delete permanently
    Then B lands on /goodbye "Your workspace is gone"
    And B's password no longer signs in
    And Stripe still shows the subscription Active and "Cancels E"
    And the workspace and its logins are gone, while its invoices and billing events stay with no agency

  @negative
  Scenario: X40 · A window left open on the deleted workspace can neither keep its plan nor delete again
    Given W2 was deleted minutes ago, and the X27 private window is untouched
    When B clicks Keep plan in that window
    Then one red toast reads "There is no running plan to cancel." or "User not found"
    When B types "X Test Two" in the delete dialog and clicks Delete permanently
    Then one red toast reads "Only admins can delete the workspace." or "User not found"
    And Stripe still shows the subscription Active and "Cancels E", with no new event

  @edge @write @clock
  Scenario: X33 · On house with an open subscription, cancelling stops only the billing
    Given W3 paid Checkout €34.80, and an SQL write then set its plan to house
    When C confirms the dialog "Billing for this workspace stops and nothing more is charged. …"
    Then the button becomes Keep plan, with no "Ends on" row or banner
    When the clock is advanced 1 hour past the period end
    Then Stripe shows it Canceled, with no renewal charge
    And Plan & billing still shows Internal and Active, with no wall or banner

  @positive @write
  Scenario: X34 · Deleting a paused solo workspace with no plan open goes straight to the goodbye page
    Given an SQL write set W3's plan to trial, and Plan & billing shows Paused
    And a second tab left Stripe's Checkout open, unpaid, for X41
    When C opens Delete workspace
    Then the dialog lists your business, your account, every post, image and report, and no end date
    When C types "X Test Solo" and clicks Delete permanently
    Then C lands on /goodbye, Stripe receives nothing, and the X41 Checkout stays open

  @edge @defect-D1
  Scenario: X41 · A Checkout opened before a solo workspace's delete can still be paid, orphaning the plan
    Given W3 was deleted in X34, and its Checkout tab has been open under 24 hours
    When that Checkout is paid with 4242 from Sofia, Bulgaria
    Then Stripe returns to the sign-in dialog
    And the invoice email arrives with no Open Plan & billing button
    And Stripe has a new Active subscription carrying the deleted W3's agency_id
    And its created and invoice.paid events answer 200 "no_workspace", and no workspace comes back

  @edge
  Scenario: X35 · Re-signing up with the same email after a delete gives a fresh trial, new Stripe customer
    Given W3 is deleted, and /goodbye is open
    When C clicks Create a new workspace, signs up with the same email and sets up the business
    Then Plan & billing shows Trial, "Trial ends" 14 days out, Choose plan, and "No documents yet — …"
    And the new row has a new id, plan trial and no Stripe customer
    And Stripe gets a new customer only at this workspace's first Checkout
