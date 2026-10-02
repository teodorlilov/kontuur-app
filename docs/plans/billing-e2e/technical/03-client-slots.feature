Feature: Client slots
  How many clients a workspace pays for, how an admin changes it, and how the slots cap the clients.
  One Stripe update per change, on a flexible-mode subscription. A client created or deleted sends nothing.

  # W1 "QA Clients": agency, admin A, member M, Europe/Sofia, a Bulgarian consumer; 2 clients to start.
  # W2 "QA Solo": solo. W3 "QA Zero": agency, 0 clients. W4 "QA Window+", W6 "QA Window−": fresh agency
  #   trials with 1 and 2 clients. W5 "QA Clock": the one workspace made while STRIPE_TEST_CLOCK is set.
  # ‹q› is the slot count Q13 leaves W1 at (7 or 8); later scenarios count from it.
  # Run order: Q8 · W1 Q6(trial) Q1 Q2(W1) Q3 Q4 Q31(row 1: Q4's raise) Q5 Q6(paid) Q7(row 1) Q9 Q35,
  #   lower 6 → 4, Q7(row 2) Q10 Q34 Q11 Q12 Q13 Q14 Q15 Q16 Q17 Q18 Q19 Q20 Q21 Q22 Q27 Q32 Q33
  #   · W6 Q2(W6) Q25(W6) · W4 Q25(W4) Q36 · W2 Q26 · W3 Q28 Q29 Q30 Q39 · W5 Q23 Q24

  Background:
    Given kontuur.app runs on the Stripe sandbox at €29.00 a month per slot, tax exclusive; card 4242
    And "Logs" means Stripe → Developers → Logs, filtered to the workspace's customer
    And an SQL write hits the named test workspace only; then I wait 70 s and reload twice
    And "copied as fetch" means DevTools → Network → the action's POST → Copy as fetch, for Console

  @positive @core
  Scenario: Q1 · Checkout sells the slots chosen, in flexible mode, and the first fill writes both counts
    Given W1 on its trial with 2 clients, "Clients to pay for" at 2 and "One slot fewer" disabled
    When A presses "One slot more", reads "3 clients × €29.00 = €87.00 a month excl. VAT", and pays
    Then Logs show the Checkout session with line_items quantity 3 and billing_mode flexible
    And the subscription is Active, quantity 3, Billing mode Flexible, its first invoice €104.40 paid
    And Plan & billing shows Clients "2 of 3" and "Client slots" 3, with no Change until it moves
    # sql: select client_slots, subscription_quantity, quantity_sync_at from agencies
    #   where id = :agency_id;  -- 3 · 3 · null

  @edge
  Scenario Outline: Q2 · Two tabs racing past the cap never leave a client above it, and Stripe is never asked
    Given <ws> <plan> with 2 clients and a cap of 3, and a new client filled in two tabs
    When its admin presses Save client in both tabs within a second
    Then one tab says "Client saved", and the other "<refusal>"
    But if both refuse, one more press in one tab says "Client saved"
    And the workspace has exactly 3 clients, and Logs show no request
    # sql: select count(*) from clients where agency_id = :agency_id;  -- 3

    Examples:
      | ws | plan                  | refusal                                                |
      | W6 | on its trial          | Trial includes 3 clients. Choose a plan to add more.   |
      | W1 | paid for 3 slots (Q1) | All 3 client slots are in use. Add a slot to add more. |

  @negative @core
  Scenario: Q3 · At the cap every Add client refuses in the slots sentence, and so does a stale form
    Given W1 with 3 clients at 3 slots (Q2), and a /clients/new form filled in tab 2
    When A looks at Add client on /clients, the dashboard and Cmd+K "add"
    Then each reads "All 3 client slots are in use. …", Cmd+K's disabled; the other two link Plan & billing
    When tab 2 presses Save client
    Then the form stays, reading "All 3 client slots are in use. Add a slot to add more."
    And W1 still has 3 clients, and Logs show no request

  @positive @core
  Scenario: Q4 · A raise is one always_invoice update, and the action itself writes both counts
    Given W1 at 3 slots, paid 3, 3 clients, and the kontuur.app webhook destination disabled
    When A steps Client slots to 4, clicks Change and confirms "Add slot"
    Then the toast reads "You now pay for 4 clients. The invoice for the rest of this period is …"
    And Logs show one POST (quantity 4, always_invoice, error_if_incomplete, expand latest_invoice)
    And with no event delivered, Clients reads "3 of 4" and the limits read 100 / 420 / 60
    And once the destination is on, I resend subscription.updated and invoice.paid; each answers 200 "written"
    # sql (before the resend): select client_slots, subscription_quantity, quantity_sync_at
    #   from agencies where id = :agency_id;  -- 4 · 4 · null
    # the invoice.paid resend documents the pro-rata invoice, and the document is emailed

  @positive @core
  Scenario: Q5 · A lower is one uncharged update; the cap drops at once, the allowance stays until renewal
    Given W1 at 4 slots, paid 4, with 3 clients (Q4)
    When A steps Client slots to 3, clicks Change and confirms "Remove slot"
    Then the toast reads "From your next renewal you pay for 3 clients. Nothing was charged or refunded."
    And Logs show one POST with quantity 3 and proration_behavior none; no invoice, credit note or refund
    And the panel reads "You pay for 4 until ‹date›, then 3.", Clients "3 of 3", limits 100 / 420 / 60
    And Add client reads "All 3 client slots are in use. Add a slot to add more."
    # ‹date› is the Sofia date of the period end, which differs from the UTC date near midnight.
    # sql: select client_slots, subscription_quantity,
    #   to_char(current_period_end at time zone timezone, 'FMDD FMMonth YYYY') as local,
    #   to_char(current_period_end at time zone 'UTC', 'FMDD FMMonth YYYY') as utc
    #   from agencies where id = :agency_id;  -- 3 · 4 · ‹date› · the UTC date

  @negative @core
  Scenario Outline: Q6 · A member can never add or delete a client, nor choose or change the slots
    Given W1 <state> with <n> clients, member M signed in
    When M looks at Add client on /clients, the dashboard and Cmd+K "add", and a client's Danger zone
    Then each reads "Only admins can add or delete clients."; no Plan & billing link, no Delete client button
    And M's Plan & billing has no "Clients to pay for", no "Client slots", no Choose plan and no Change
    When M saves a filled /clients/new
    Then it reads "Only admins can add or delete clients.", Logs show no request, and W1 keeps <n> clients

    Examples:
      | state        | n |
      | on its trial | 2 |
      | paid (Q5)    | 3 |

  @positive @core
  Scenario Outline: Q7 · A raise within what this period paid for is one uncharged update
    Given W1 at <from> slots, paid <paid>, with <n> clients
    When A steps Client slots to <to> and clicks Change
    Then the confirm reads "You already paid for <paid> this period, so nothing is charged today. …"
    When A confirms "Add slot"
    Then the toast reads "<toast>"
    And Logs show one POST with quantity <to> and proration_behavior none, and no invoice
    # sql: select client_slots, subscription_quantity from agencies where id = :agency_id;  -- <to> · <paid>

    Examples:
      | from | paid | n | to | toast                                                              |
      | 3    | 4    | 3 | 4  | You now pay for 4 clients again. Nothing was charged.              |
      | 4    | 6    | 4 | 5  | From your next renewal you pay for 5 clients. Nothing was charged. |

  @negative @core
  Scenario: Q8 · The database refuses tenant inserts and deletes on clients
    Given migration 20260864 is applied
    When I read the table privileges on public.clients in the SQL editor
    Then authenticated and anon have neither INSERT nor DELETE
    And authenticated keeps SELECT and UPDATE
    And service_role keeps INSERT and DELETE
    # sql: select r, p, has_table_privilege(r, 'public.clients', p)
    #   from unnest(array['authenticated','anon','service_role']) r,
    #   unnest(array['DELETE','INSERT','SELECT','UPDATE']) p;

  @positive @core
  Scenario: Q9 · A raise past a lower charges only the slots above what this period paid for
    Given W1 lowered again to 3 slots as in Q5, paid 4, with 3 clients
    When A steps Client slots to 6 and clicks Change
    Then the confirm reads "About ‹amount› excl. VAT is charged today …" and "1 of them is already paid …"
    When A confirms "Add slots"
    Then one paid invoice credits 4 slots and debits 6 for the rest of the period, netting about 2
    And ‹amount› is within a few cents of its subtotal; the row has client_slots 6, paid quantity 6

  @positive @core
  Scenario: Q10 · Deleting a client frees its slot and sends nothing to Stripe
    Given W1 at 5 slots, paid 6, with 4 clients (Q7 row 2)
    When A opens a client's Delete client dialog
    Then it ends "This frees one of your 5 client slots. Your plan still bills for 5; to pay for fewer, …"
    When A types the name and presses Delete permanently
    Then Logs show no request and no event, and Clients reads "3 of 5"
    # sql: select client_slots, subscription_quantity from agencies where id = :agency_id;  -- 5 · 6

  @negative
  Scenario: Q11 · A lower to the client count is refused when a client was added after the page loaded
    Given W1 at 5 slots with 2 clients, and tab 1's Client slots stepped down to 2, "One slot fewer" disabled
    And under it tab 1 reads "You have 2 clients. Delete a client first to pay for fewer."
    When tab 2 adds a client, and tab 1 then clicks Change and confirms "Remove slots"
    Then tab 1's toast reads "You have 3 clients. Delete a client first to pay for fewer."
    And Logs show no request, and Stripe stays at 5

  @edge @write
  Scenario: Q12 · A slot-change claim held elsewhere refuses at once, and a stale one is taken over
    Given W1 at 5 slots with 3 clients, and SQL write: its quantity_sync_at is now() + 1 hour
    When A steps Client slots to 4, clicks Change and confirms "Remove slot"
    Then within seconds the toast reads "Another change to your plan is in progress. Try again in a moment."
    And Logs show no request, Stripe stays at 5, and quantity_sync_at keeps the stamp
    When SQL write sets the stamp to now() - 5 minutes, and A makes the same change again
    Then the toast reads "From your next renewal you pay for 4 clients. Nothing was charged or refunded."
    # sql: select quantity_sync_at from agencies where id = :agency_id;  -- null after the second try

  @edge
  Scenario: Q13 · Two windows changing the slots at once: one change lands, the other gives way
    Given W1 at 4 slots, paid 6, with Plan & billing open in tabs 1 and 2
    When tab 1 steps to 8 and tab 2 to 7, each clicks Change, and both confirm within a second
    Then one tab's toast reads "You now pay for ‹q› clients. The invoice for the rest of this period is …"
    And the other reads "Another change to your plan is in progress. …" or "Your client slots were changed …"
    And Stripe holds ‹q› with one paid invoice for the ‹q − 6› slots above the 6 paid, no credit note
    And the customer balance is €0.00, and the row has client_slots ‹q› and paid quantity ‹q›

  @negative @core @defect-D11
  Scenario: Q14 · A declined slot raise is refused, and leaves nothing for Stripe to collect later
    Given W1 at ‹q› slots, paid ‹q›, with 4000 0000 0000 0341 made the default card in Manage billing
    When A steps Client slots one higher, clicks Change and confirms "Add slot"
    Then it toasts "The card on file was declined: ‹reason› Update it under Manage billing and try again."
    And Stripe stays at ‹q› and active, with no invoice for it paid, open or draft an hour later
    When 4242 is made the default again, and A confirms the same raise
    Then the toast reads "You now pay for ‹q + 1› clients. …", with one paid invoice and one document
    # sql (after the decline): select client_slots, subscription_quantity, quantity_sync_at
    #   from agencies where id = :agency_id;  -- ‹q› · ‹q› · null

  @edge
  Scenario: Q15 · A raise the bank wants confirmed is refused whole; a card set up for 3-D Secure pays
    Given W1 at ‹q + 1› slots, all paid, and 4000 0027 6000 3184 saved as the default in Manage billing
    When A steps Client slots one higher, clicks Change and confirms "Add slot"
    Then the toast reads "Your bank asked to confirm this payment, which Kontuur cannot take yet. …"
    And Stripe and the row stay at ‹q + 1›, with no invoice for the raise paid, open or draft
    When 4000 0025 0000 3155 is the default after its 3-D Secure check, and A confirms the same raise
    Then it toasts "You now pay for ‹q + 2› clients. …", with one paid pro-rata invoice and its document
    # The first toast ends "Nothing was charged and your client slots are unchanged."; the dialog stays.
    # If the 3155 raise gets the bank's sentence too, record it. Afterwards 4242 is the default again.

  @edge @write
  Scenario: Q16 · A row that drifted from Stripe is refused once, and rewritten from Stripe's copy
    Given W1 at ‹q + 2› slots in Stripe, and SQL write: its client_slots is ‹q + 1›
    When A reloads Plan & billing, steps Client slots to ‹q + 2›, clicks Change and confirms
    Then the toast reads "Your client slots were changed in another window. Reload the page and try again."
    And Logs show the subscription read and no update, and no event is sent
    And after a reload Client slots reads ‹q + 2›, with nothing charged
    # sql: select client_slots from agencies where id = :agency_id;  -- ‹q + 2›, written by the refusal

  @edge
  Scenario: Q17 · A count above 50 set in Stripe can be lowered in the app, never raised
    Given W1 at ‹q + 2› slots, and I set the quantity to 60 in the Stripe Dashboard, proration off
    When customer.subscription.updated answers 200 "written", and A reloads Plan & billing
    Then Client slots reads 60 with "One slot more" disabled, and the paid quantity is unchanged
    When A steps to 55, clicks Change and confirms "Remove slots"
    Then the toast reads "From your next renewal you pay for 55 clients. Nothing was charged or refunded."
    And A lowers back to ‹q + 2› the same way, with DevTools open, and copies that request as fetch

  @negative
  Scenario Outline: Q18 · The slot action re-checks every bound, whatever the page sent
    Given W1 at ‹q + 2› slots with 3 clients, and Q17's last request copied as fetch
    When I replay it in <whose> Console with its body set to <body>
    Then the response carries <answer>
    And Logs show no request, the row is unchanged, and quantity_sync_at is null

    Examples:
      | whose | body                        | answer                                                        |
      | A's   | "to": -1                    | "Invalid number of client slots"                              |
      | A's   | "to": 2.5                   | "Invalid number of client slots"                              |
      | A's   | "to": 2                     | "You have 3 clients. Delete a client first to pay for fewer." |
      | A's   | "from": ‹q + 2›, "to": 51   | "A workspace can pay for at most 50 client slots."            |
      | A's   | "to" equal to "from"        | ok: true with outcome "same"                                  |
      | M's   | as copied                   | "Only admins can manage the plan."                            |

  @edge @write
  Scenario: Q19 · A change Stripe made whose row write failed is still reported as made
    Given W1 at ‹q + 2› slots with 3 clients, and the trigger below refusing W1's client_slots writes
    When A steps Client slots one lower, clicks Change and confirms "Remove slot"
    Then the toast reads "From your next renewal you pay for ‹q + 1› clients. Nothing was charged …"
    And Vercel logs "[billing:slots] changed for ‹agency id›, row not written:"; Stripe holds ‹q + 1›
    And the row still has ‹q + 2› and no claim, and customer.subscription.updated answers 500
    And after I drop the trigger and resend that event, it answers 200 "written", and the row has ‹q + 1›
    # sql write (before): create function public.qa_refuse_slots() returns trigger language plpgsql
    #   as $$ begin raise exception 'qa: client_slots write refused'; end $$;
    #   create trigger qa_refuse_slots before update of client_slots on public.agencies for each row
    #   when (new.id = :agency_id and new.client_slots is distinct from old.client_slots)
    #   execute function public.qa_refuse_slots();
    # sql write (after): drop trigger qa_refuse_slots on public.agencies;
    #   drop function public.qa_refuse_slots();

  @edge
  Scenario: Q20 · A plan set to end keeps its slots: the control says why, and the delete dialog is silent
    Given W1 with 3 clients, and tab 2 on Plan & billing with Client slots stepped one higher
    When A presses Cancel plan in tab 1 and confirms
    Then tab 1 shows no stepper, only "Your plan ends on ‹date›. Keep your plan to change its client slots."
    And tab 2's Change, confirmed, toasts that sentence, with no further subscription request in Logs
    And a client's Delete client dialog ends "This cannot be undone." with no sentence about slots
    And after Keep plan, Plan & billing shows the stepper and "Renews on" again

  @edge @write
  Scenario: Q21 · A failed payment leaves the slots as they are, and the action says why
    Given W1 with 3 clients, and SQL write: subscription_status past_due, past_due_since now()
    When A opens Plan & billing
    Then it shows no stepper, only "Your last payment failed. Update your card in Plan & billing to continue."
    And a replay of Q17's request answers that sentence, and Logs show no request
    And after SQL write status active, past_due_since null, the stepper is back

  @edge @write
  Scenario: Q22 · A tab left open past the period end refreshes on Change and waits for the renewal
    Given SQL write: W1's current_period_end is 3 minutes from now, the old value noted
    And tab 2, loaded after the write, has Client slots stepped one lower
    When the 3 minutes have passed, and tab 2 clicks Change
    Then tab 2 refreshes, with no dialog and no toast, and Logs show no request
    And it shows no stepper, only "Your plan is renewing, and its payment is taken within about an hour. …"
    And after SQL write current_period_end = the noted value and a reload, the stepper is back

  @edge @clock
  Scenario: Q23 · A raise under €0.50 goes on the renewal invoice, and the allowance waits for it
    Given W5 at 1 slot, paid 1, 1 client, under 12 h before its period end on the clock and in real time
    When its admin steps Client slots to 2 and clicks Change
    Then the confirm reads "About ‹amount› excl. VAT for the rest of this period is added to your invoice …"
    When the admin confirms "Add slot"
    Then the toast reads "You now pay for 2 clients. The amount for the rest of this period is added …"
    And Logs show one POST with create_prorations and no invoice; Clients "1 of 2", limits 25 / 105 / 15
    # sql: select client_slots, subscription_quantity from agencies where id = :agency_id;  -- 2 · 1

  @edge @clock
  Scenario: Q24 · Past the period end Stripe's own period is checked, and a page left open is refused after
    Given W5 at 2 slots, paid 1 (Q23), and tab 1 on Plan & billing with Client slots stepped to 3
    When I advance the clock 30 minutes past the period end, and tab 1 clicks Change and confirms
    Then it toasts "Your plan is renewing, and its payment is taken …", with no subscription update
    When I advance 2 more hours, the renewal is paid, and tab 1 presses the confirm again
    Then it toasts "Your plan has renewed since this page loaded. Reload the page to see its new period."
    And the renewal billed the proration lines and 2 × €29.00, and invoice.paid answered "period_paid"
    # sql: select current_period_start, client_slots, subscription_quantity from agencies
    #   where id = :agency_id;  -- the old period end · 2 · 2
    # Run it within the hours Q23 leaves before the period end in real time, or tab 1 refuses on its own.
    # The new period starts in the real future (a test-clock artefact): raise nothing more on W5.

  @edge
  Scenario Outline: Q25 · A client added or deleted while Checkout is open: Stripe bills the slots bought
    Given <ws> on its trial with <n> clients, and tab 1 on Checkout for <n> slots
    When tab 2 <change>, and tab 1 pays
    Then Stripe's quantity is <n>, with one paid invoice for <n> × €29.00 + VAT and no other
    And Plan & billing shows Clients "<meter>" and Client slots <n>; the row has <n> ordered and paid
    And Add client <add>

    Examples:
      | ws | n | change           | meter  | add                                                             |
      | W4 | 1 | adds two clients | 3 of 1 | reads "Your one client slot is in use. Add a slot to add more." |
      | W6 | 3 | deletes a client | 2 of 3 | is enabled                                                      |

  @edge
  Scenario: Q26 · A solo workspace pays for its one business, and nothing adds a second
    Given W2 "QA Solo" on its trial with its one business, admin B signed in
    When B opens Plan & billing, sees "€29.00 a month excl. VAT for your business" with no stepper, and pays
    Then the subscription has quantity 1, and the panel keeps that line with no stepper or Change
    When B saves a second business on /clients/new, opened by its address
    Then it reads "Your plan covers one business.", and W2 keeps one business with no request in Logs
    And Q17's request, replayed in W2's Console, answers "A solo workspace pays for its one business."

  @edge @write
  Scenario: Q27 · On the Internal plan clients pass the slots unbilled, and the slots cannot change
    Given W1 lowered to 3 slots with 3 clients, and SQL write: its plan is house
    When A adds a 4th client, which says "Client saved", then deletes it
    Then Logs show no request, and Plan & billing has no Client slots stepper
    And a replay of Q17's request answers "The Internal plan has no client slots to change."
    And M's Add client still reads "Only admins can add or delete clients."
    And after SQL write plan = trial, Add client reads "All 3 client slots are in use. …" again

  @negative @write
  Scenario: Q28 · An ended trial with no clients is told to choose a plan to add one
    Given W3 "QA Zero" with 0 clients, and SQL write: its trial ended 1 day ago
    When its admin opens the dashboard
    Then Add client is disabled with "Choose a plan to add clients." and a Plan & billing link
    And Client coverage reads "No clients yet. Choose a plan to add clients."

  @edge
  Scenario: Q29 · Zero clients at Checkout buys one slot, and the first client fills it
    Given W3 in its trial's grace with 0 clients, "Clients to pay for" at 1 and "One slot fewer" disabled
    When its admin pays at Choose plan, the panel reading "1 client × €29.00 = €29.00 a month excl. VAT"
    Then Stripe bills 1 × €29.00 + 20 % VAT, paid, quantity 1, Billing mode Flexible
    When the admin adds a first client, then tries a second
    Then the first says "Client saved", with no request in Logs
    And the second reads "Your one client slot is in use. Add a slot to add more."

  @positive
  Scenario: Q30 · Deleting the only client frees the one slot, and the plan still bills for one
    Given W3 paid for 1 slot with its one client (Q29)
    When its admin opens the client's Delete client dialog
    Then it ends "This frees your client slot. Your plan still bills for one client until you cancel it …"
    When the admin deletes it
    Then Logs show no request, and Plan & billing shows Clients "0 of 1" and Client slots 1
    And "One slot fewer" is disabled, over "Room for 1 more client before you need another slot."

  @edge
  Scenario Outline: Q31 · A slot raise's document carries the customer's own VAT treatment
    Given a workspace that paid at Checkout as <customer>
    When its admin raises Client slots above what it paid for, and confirms "Add slot"
    Then Stripe's new pro-rata invoice is paid with <VAT>
    And the newest document shows vat_basis <basis> and vat_rate <rate>; nothing unfinished

    Examples:
      | customer                       | VAT                          | basis          | rate  |
      | Bulgarian consumer (W1, Q4)    | 20 % VAT                     | domestic       | 20.00 |
      | EU business with a VAT ID, C23 | €0.00, marked reverse charge | reverse_charge | 0     |
      | non-EU (United States)         | €0.00                        | outside_eu     | 0     |

  @negative
  Scenario: Q32 · An admin cannot open, and so cannot delete, another workspace's client
    Given A signed in to W1, with W2's business id at hand
    When A opens /clients/‹W2's business id›/edit
    Then the not-found page shows, with no Danger zone
    And a Cmd+K search for the W2 business's name reads "Nothing matches “‹name›”."

  @negative
  Scenario Outline: Q33 · The delete dialog takes the client's name only, forgiving case and spacing
    Given W1 paid, with a client named "Acme Studio"
    When A opens its Delete client dialog and types <typed>
    Then Delete permanently is <state>
    And after Cancel the dialog reopens empty, and nothing was deleted

    Examples:
      | typed              | state    |
      | "Acme Studi"       | disabled |
      | "AcmeStudio"       | disabled |
      | "  ACME   STUDIO " | enabled  |

  @edge
  Scenario: Q34 · The same client deleted twice is deleted once
    Given W1 with 3 clients, and one client's delete dialog filled in two tabs
    When A double-clicks Delete permanently in tab 1, then presses it in tab 2
    Then tab 1 shows one "‹name› deleted", and tab 2's toast reads "Not found"
    And W1 has 2 clients, and Logs show no request

  @negative
  Scenario: Q35 · A double click on Save client makes one client, and nothing reaches Stripe
    Given W1 with 3 clients at 6 slots (Q9)
    When A fills /clients/new and double-clicks Save client
    Then the button spins and ignores the extra click; one "Client saved"
    And /clients lists 4, Clients reads "4 of 6", and Logs show no request

  @edge
  Scenario: Q36 · A workspace over its slots is charged only when its admin raises them, to its clients
    Given W4 at Clients "3 of 1" (Q25), in red, read out as "more than the plan holds"
    When its admin opens Plan & billing, and a client's Delete client dialog
    Then Client slots reads 1 with "One slot fewer" disabled and no Change, and the dialog names no bill
    When the admin presses "One slot more" once, and Change
    Then it reads 3, and the confirm is "Add 2 client slots"; "Add slots" pays one pro-rata invoice
    And Clients reads "3 of 3", and Logs show no other subscription update for W4 since its Checkout

  @negative
  Scenario: Q39 · A member at zero clients is refused on /generate and at /clients/new alike
    Given W3 paid with 0 clients (Q30), member M3 invited and signed in
    When M3 opens /generate
    Then "Add your first client" is disabled with "Only admins can add or delete clients." and no link
    When M3 types /clients/new, fills the form and presses Save client
    Then the form stays filled with "Only admins can add or delete clients."
    And Logs show no request, and W3 keeps 0 clients
