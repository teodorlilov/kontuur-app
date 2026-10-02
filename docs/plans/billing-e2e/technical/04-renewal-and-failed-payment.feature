Feature: Renewal and a failed payment
  Stripe test clock; the 7-day grace counts real days. "answers X" = webhook 200 with outcome X.
  Read the retry policy before R10; never pass its last retry before R24.

  # Run order: R41 R1 R2 R3 R5 R7 R8 R9 R14 R10 R33 R11 R13 R15 R42 R16 R43 R39 R17 R18
  #   R34 R19 R35-LA R45 R35-Sofia R20 R21 R23 R24 R36 R47

  @negative
  Scenario: R41 · An unknown test clock id refuses Choose plan and writes nothing
    Given STRIPE_TEST_CLOCK is "clock_R41_does_not_exist", redeployed, and a new trial "R Bad Clock"
    When I click Choose plan twice
    Then each click shows "Could not open Stripe just now. Please try again in a moment."
    And no Checkout opens
    And Vercel logs "[billing:checkout] failed for ‹agency id›:" with Stripe's error
    And the row has no Stripe ids

  @positive @core @clock
  Scenario: R1 · A new workspace's Stripe customer joins the test clock and pays for 2 clients
    Given the test clock "R renewal" at a month's last day 22:30 UTC, set in STRIPE_TEST_CLOCK
    And "R Clock Test" in Europe/Sofia with 2 clients, Generate automatically off, an invited member
    When I keep "Clients to pay for" at 2 and pay Checkout with 4242, a Bulgarian address, no tax ID
    Then I see "You’re on Pro" · Clients 2 · €58.00 excl. VAT · Renews ‹clock + 1 month›
    And the clock page lists the customer; the subscription is Flexible, its first invoice paid at €69.60
    And the row is active, client_slots 2, paid quantity 2, with one domestic 20 % document of €69.60

  @edge @clock
  Scenario: R2 · A workspace that already has a Stripe customer never joins the clock
    Given STRIPE_TEST_CLOCK is still deployed
    And another test workspace has a Stripe customer and no plan
    When its admin clicks Choose plan and backs out of Checkout
    Then no new Stripe customer exists
    And its customer is not on the "R renewal" clock page
    And STRIPE_TEST_CLOCK is then removed and redeployed

  @negative
  Scenario: R3 · A quantity raised in the Stripe Dashboard becomes the slots, but is not taken as paid
    Given "R Clock Test" is Active with 2 clients, Client slots 2, and 2 slots paid for
    When I set the subscription quantity to 3 in the Stripe Dashboard, proration off
    Then its update answers "written", with no new invoice, and the upcoming invoice is 3 × €29.00
    And after a reload Plan & billing shows Clients "2 of 3", Client slots 3, and still 50 / 210 / 30
    When I lower Client slots to 2, click Change and confirm "Remove slot"
    Then I see "From your next renewal you pay for 2 clients. Nothing was charged or refunded."

  @positive @core @clock
  Scenario: R5 · A paid renewal moves the period and issues an invoice, dated in Sofia time
    Given Invoices lists one row
    When I advance the clock to 2 hours after the period end
    Then invoice.paid answers "period_paid", and the renewal is paid at €69.60
    And "Renews on" moves one month as a Sofia date: 30 Nov 22:30 UTC reads "1 December 2026"
    And Invoices gets a new top row with the next number, today's real date and €69.60
    And the new document is domestic, €69.60, delivered

  @edge @write
  Scenario Outline: R7 · Old events delivered again change nothing (<after>)
    Given an SQL write on the test workspace marks <events> unprocessed
    When I resend them from the Stripe webhook page, <order>
    Then both answer "written", not "duplicate", and nothing is charged
    And Plan & billing is unchanged
    And no new bell, email or Invoices row appears
    And the row is unchanged
    # sql: update billing_events set processed_at = null
    #   where agency_id = :agency_id and id in ('‹evt›', '‹evt›');

    Examples:
      | ID  | after         | events                               | order              |
      | R7  | R5 renewed    | R1 invoice.paid, R5 sub.updated      | invoice.paid first |
      | R34 | R18 recovered | past_due sub.updated, payment_failed | the failure first  |
      | R47 | R36 cancelled | past_due sub.updated, payment_failed | any order          |

  @negative
  Scenario: R8 · Manage billing offers only card and billing details, and refuses a declined card
    Given the workspace is Active on •••• 4242
    When I open Manage billing
    Then the portal shows card and billing details only: no cancel, plan or quantity change, or invoices
    When I try to save card 4000 0000 0000 9995
    Then the portal refuses it, and the default card stays •••• 4242
    And its return link lands on /settings?tab=account, unchanged

  @positive @core
  Scenario: R9 · A card that fails only when charged goes on file through Manage billing
    Given the workspace is Active on •••• 4242
    When I add 4000 0000 0000 0341 in Manage billing and make it the default
    Then the customer's and the subscription's card are both •••• 0341
    And nothing is charged
    And the app still shows Active with no banner

  @edge @defect-D11
  Scenario: R14 · A slot raise on a declining card is refused, and leaves no invoice to collect later
    Given the workspace is Active with 2 clients, Client slots 2, and •••• 0341 on the subscription
    When I raise Client slots to 3, click Change and confirm "Add slot"
    Then I see "The card on file was declined: ‹reason› Update it under Manage billing and try again."
    And after a reload Plan & billing still shows Client slots 2 and Clients "2 of 2"
    And Stripe's quantity is still 2, nothing is charged, and no pro-rata invoice is left open or draft
    And the row still has client_slots 2 and paid quantity 2

  @positive @core @clock
  Scenario: R10 · A failed renewal: past due, one bell, one email, the grace banner, the period stays
    Given •••• 0341 is on the subscription, and one post was generated this period
    When I advance the clock to 2 hours after the period end
    Then pages stay open with "Your last payment failed. Update your card by ‹today + 7› …"
    And one bell "A payment failed" and one email "Your Kontuur payment failed" arrive
    And Plan & billing shows "Payment failed", no "Renews on", and the meters not reset
    And the row shows past_due, past_due_since ≈ now, the period unchanged, no new document

  @negative
  Scenario Outline: R33 · A failed payment the app did not make rings nothing
    Given the workspace is past due with •••• 0341 as the customer's default card
    When I create <what> on this customer in the Stripe Dashboard, and its charge fails
    Then its deliveries answer "ignored", and nothing is charged
    And the banner date, the bell count and Plan & billing are unchanged, and no email arrives
    And the subscription is still Past due, and the row keeps its status and past_due_since
    And afterwards I <cleanup> it

    Examples:
      | what                                       | cleanup        |
      | a subscription with no metadata            | cancel at once |
      | a €5.00 one-off invoice, automatic tax off | void           |

  @edge @clock
  Scenario Outline: R11 · A later failed retry rings nothing and keeps the grace date
    Given the workspace is <state>, and the next attempt is not Stripe's last retry
    When I advance the clock just past "Next payment attempt"
    Then invoice.payment_failed answers "written", and the log line ends "<log>"
    And no new bell or email arrives
    And the app still shows <app>
    And past_due_since is unchanged

    Examples:
      | ID  | state                     | log                 | app                                 |
      | R11 | past due, after R10       | reminder suppressed | the banner with R10's date          |
      | R43 | paused by R16's SQL write | : written           | the paused wall, "Update your card" |
      | R45 | past due, 2nd episode, LA | reminder suppressed | the Los Angeles banner date         |

  @negative @defect-D10
  Scenario Outline: R13 · A member sees the failed payment but has nothing to act with (<state>)
    Given the workspace is <state>, and I sign in as the invited member
    When I open the dashboard, the bell and Plan & billing
    Then I see <sees>
    And Plan & billing shows <status>
    And it has no Cancel plan, Manage billing or Invoices
    And the member gets no "Your Kontuur payment failed" email

    Examples:
      | ID  | state             | sees                            | status                                  |
      | R13 | past due          | the banner and one payment bell | "Payment failed", "Update your card by" |
      | R39 | paused, plan open | Update your card, to billing    | "Paused" and the paused sentence        |

  @edge
  Scenario: R15 · Deleting a client in the grace frees a slot and changes nothing in Stripe
    Given the workspace is past due with 2 clients and 2 client slots
    When I delete one client
    Then the dialog reads "This frees one of your 2 client slots. Your plan still bills for 2; …"
    And Plan & billing shows Clients "1 of 2", still "of 50", "of 210", "of 30", and "Payment failed"
    And the slot control reads "Your last payment failed. Update your card in Plan & billing to continue."
    And Stripe gets no update: quantity still 2, no new event, and the open renewal still bills €69.60

  @edge @write
  Scenario Outline: R42 · In the grace, <count> of 50 AI drafts <result>, and nothing resets
    Refusal: "You've used all 50 AI drafts for this period. Update your card in Plan & billing to continue."

    Given the workspace is past due with limits 50 / 210 / 30
    And an SQL write on the test workspace sets the unpaid period's draft counter to <count>
    When I open Plan & billing, the dashboard and /generate
    Then AI drafts reads "<count> of 50" in <colour>
    And the dashboard's Generate posts <button>, and /generate shows <generate>
    And the status stays "Payment failed", with no meter reset and no allowance bell
    # sql: insert into usage_counters (agency_id, period, kind, count)
    #   select id, to_char(current_period_start at time zone 'UTC', 'YYYY-MM-DD'), 'draft', <count>
    #   from agencies where id = :agency_id and subscription_status = 'past_due'
    #   on conflict (agency_id, period, kind) do update set count = excluded.count;

    Examples:
      | count | result          | colour | button                       | generate                 |
      | 49    | still generates | amber  | is a link                    | its form                 |
      | 50    | is refused      | red    | is disabled over the refusal | the refusal for its form |

  @edge @core @write
  Scenario: R16 · The grace ends on time: paused with "Update your card" once it runs out
    Given the workspace is past due with 1 client, and an SQL write ends its grace in 10 minutes
    When I reload Plan & billing at once
    Then it shows "Payment failed" and "Update your card by ‹today's Sofia date›"
    When 11 minutes later I reload Plan & billing and the dashboard
    Then Plan & billing shows "Paused", Cancel plan and Manage billing, and no Choose plan
    And every other page shows the "Workspace paused" wall with one "Update your card" button
    # sql: update agencies set past_due_since = now() - interval '7 days' + interval '10 minutes'
    #   where id = :agency_id and subscription_status = 'past_due';

  @negative
  Scenario: R17 · A paused workspace with its plan open is walled and not reminded again
    Given the workspace is paused with its plan open and 1 client
    When I open Dashboard, Calendar, Clients, a client's edit page, /generate and /clients/new
    Then the first four show the wall, and the last two land on Plan & billing
    And Cmd+K Add client is disabled with "Update your card to add clients."
    When I run the billing cron by hand
    Then it answers 200, and no "Your workspace is paused" bell or email arrives

  @positive @core @clock
  Scenario: R18 · Fixing the card pays the renewal, and the allowance is the slots paid for
    Given the workspace is paused with 1 client and 2 client slots, and the renewal for 2 is still open
    When I click the wall's Update your card, open Manage billing and make 4242 the default
    Then within 2 minutes the renewal is paid at €69.60, and invoice.paid answers "period_paid"
    And Plan & billing shows Active, Clients "1 of 2", Client slots 2, and "0 of 50", "0 of 210", "0 of 30"
    And Cmd+K's Add client is enabled, its hint "Action"
    And the row shows active, no past_due_since, client_slots 2, paid quantity 2

  @edge @clock
  Scenario Outline: R19 · A second failed renewal starts a new episode; its bell follows the UTC day
    Given Client slots was lowered 2 → 1 after R18, and •••• 0341 is back on the subscription
    When I advance the clock to 2 hours after the period end
    Then the banner is back with "Update your card by ‹today + 7, Sofia›"
    And Stripe shows the new renewal open at €34.80 and the subscription Past due
    And with today's UTC date <day> R10's, <bell> arrives and the log ends "<log>"
    And the row has a new past_due_since, and <bells>
    # sql: select dedup_key from notifications where agency_id = :agency_id and type = 'payment_failed';

    Examples:
      | day         | bell                       | log                 | bells                     |
      | the same as | no bell and no email       | reminder suppressed | one payment_failed bell   |
      | later than  | one new bell and one email | reminder emailed    | two bells, with a new key |

  @edge @write
  Scenario Outline: R35 · The grace's last day is written in the workspace's timezone (<zone>)
    Given the workspace is past due in its second episode
    And <setup>
    When I read Plan & billing, then reload another page twice after a minute
    Then "Update your card by" and the banner both name <date>
    And the bell from R19 keeps the sentence it was written with
    # sql: select ((past_due_since + interval '7 days') at time zone '<zone>')::date
    #   from agencies where id = :agency_id;
    # sql (Sofia row): update agencies set past_due_since =
    #   (((now() at time zone 'UTC')::date - 1) + time '22:30') at time zone 'UTC'
    #   where id = :agency_id and subscription_status = 'past_due';

    Examples:
      | zone                | setup                                  | date                           |
      | America/Los_Angeles | I set the timezone to Los Angeles      | the Los Angeles grace-end date |
      | Europe/Sofia        | SQL: first failure yesterday 22:30 UTC | today's UTC date + 7           |

  @edge @clock
  Scenario: R20 · A 3-D Secure card saved in Manage billing pays the renewal with nobody present
    Given the workspace is past due with the renewal for 1 client open
    When I add 4000 0025 0000 3155 in Manage billing, authenticate it, and make it the default
    Then the renewal is paid at €34.80 on •••• 3155 with no further authentication
    And invoice.paid answers "period_paid"
    And the app is Active with no banner, Clients "1 of 1", and 0 of 25, 0 of 105, 0 of 15
    But if the renewal is left needing authentication, record that the app cannot authenticate it

  @edge @clock
  Scenario Outline: R21 · A renewal's invoice follows the customer's current country and VAT ID
    Given the workspace is Active with 1 client and a good card
    When I set the billing country and tax ID to <customer> in Manage billing
    And I advance the clock to 2 hours after the period end
    Then the renewal is paid at <amount>, and a new Invoices row and its email arrive
    And the PDF shows the customer's details and the VAT row <VAT row>
    And the newest document is <basis>, tax group <group>, with the customer's country

    Examples:
      | ID  | customer            | amount | VAT row                        | basis          | group |
      | R46 | DE, no tax ID       | €34.80 | "Bulgarian VAT (20 %)" €5.80   | domestic       | Б     |
      | R21 | DE, VAT DE123456789 | €29.00 | "Reverse charge, Art. 21(2)…"  | reverse_charge | А     |
      | R22 | MK, tax ID removed  | €29.00 | "Outside the scope of EU VAT…" | outside_eu     | А     |

  @edge @clock
  Scenario: R23 · Two unpaid renewals: only the newer one moves the period
    Given a retry policy over a month long, and •••• 0341 on the Active 1-slot subscription
    When I advance the clock to 2 hours after the period end, then one more month
    Then both renewals fail, and the app stays "Payment failed" with the same banner date
    When I make 4242 the default card
    Then both invoices are paid: the older answers "written", the newer "period_paid"
    And the period jumps straight to Stripe's current one, and past_due_since is cleared

  @edge @clock
  Scenario Outline: R24 · After Stripe's last retry, the app follows what Stripe did (<policy>)
    Given the subscription is past due with •••• 0341
    When I advance the clock past the last retry
    Then Stripe and the row both show the subscription <status>, and the delivery answers "written"
    And Plan & billing shows <plan>
    And the wall's button reads <button>
    And no bell or email arrives, and past_due_since is <since>

    Examples:
      | policy          | status   | plan                                  | button           | since |
      | cancels         | canceled | "Paused", only Choose plan            | Choose a plan    | null  |
      | marks unpaid    | unpaid   | "Paused", Cancel plan, Manage billing | Update your card | null  |
      | leaves past due | past_due | no change until the grace ends        | unchanged        | kept  |

  @positive @core @clock
  Scenario: R36 · Cancelling in a failed renewal ends the plan at once; the payment is never collected
    Given the plan is still open with a failed renewal on •••• 0341
    When I click Cancel plan and confirm "Your plan ends now and the failed payment is not collected; …"
    Then the toast reads "Your plan has ended.", and Plan & billing shows "Paused" and only Choose plan
    And Stripe shows the subscription Canceled at once
    When I advance the clock past the invoice's old "Next payment attempt"
    Then Stripe makes no new attempt: no charge, no invoice.payment_failed, no invoice.paid
