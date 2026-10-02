Feature: Webhook robustness and the billing cron
  Each signed Stripe event is recorded once; a failure answers 500 until fixed.
  The billing cron releases stale reservations and sends each reminder once.

  Background:
    Given test workspaces E2E-W (paid, active, I am admin) and E2E-W trial (no plan)
    And a throwaway Stripe customer "E2E-W throwaway"
    And hand-made subscriptions have a 30-day free trial and are cancelled Immediately after
    And the billing cron is never run 07:45–08:15 UTC

  @positive
  Scenario: W1 · A Stripe event is recorded, handled and stamped once
    When I add the metadata key e2e_note = w1 to E2E-W's subscription
    Then customer.subscription.updated answers "written"
    And Stripe makes no invoice, and Plan & billing is unchanged
    And there is one billing_events row for the event: E2E-W's, processed, no error

  @negative @core
  Scenario: W2 · The same event resent answers "duplicate" and changes nothing
    Given W1's event is processed, with its processed_at noted
    When I Resend it three times, twice in quick succession
    Then every resend answers "duplicate", with no new [billing:webhook] line
    And the subscription and its invoices are untouched
    And there is still one row for the event, with the same processed_at

  @negative @core
  Scenario Outline: W3 · A POST that Stripe did not sign is refused with 400 and recorded nowhere
    When I POST a forged "subscription deleted" event for E2E-W with <signature>
    Then it answers 400 {"error":"Invalid signature"}
    And Vercel logs "[billing:webhook] signature rejected:" with "<reason>"
    And E2E-W's subscription stays active
    And no billing_events row has the id evt_e2e_forged_w3

    Examples:
      | signature                | reason                            |
      | no stripe-signature      | No stripe-signature header value… |
      | t=1790000000,v1=deadbeef | No signatures found matching…     |
      | that header, empty body  | No webhook payload was provided.  |

  @negative
  Scenario Outline: W4 · A wrong or missing webhook secret refuses events; a resend delivers once fixed
    Given STRIPE_WEBHOOK_SECRET in Vercel Production is <secret>, redeployed
    When I change e2e_note on E2E-W's subscription
    Then the delivery fails with HTTP <status> <body>, and no billing_events row exists
    And Vercel logs "<log>"
    When I restore the real secret, redeploy and Resend the failed delivery
    Then it answers "written" or "duplicate", with one processed row

    Examples:
      | secret          | status | body                               | log                           |
      | whsec_e2e_wrong | 400    | {"error":"Invalid signature"}      | No signatures found matching… |
      | deleted         | 503    | {"error":"Webhook not configured"} | STRIPE_WEBHOOK_SECRET not set |

  @negative
  Scenario Outline: W5 · A subscription with no or an unknown agency_id touches no workspace
    When I create a throwaway-customer subscription with <metadata>, then cancel it
    Then Stripe charges nothing
    And its created, €0 invoice.paid and deleted each answer "<outcome>"
    And all three rows are processed with no agency and no error
    And the €0 invoice has no document, and no workspace holds the subscription

    Examples:
      | metadata                                         | outcome      |
      | no metadata                                      | ignored      |
      | agency_id = 00000000-0000-4000-8000-000000000000 | no_workspace |

  @negative @core
  Scenario: W7 · A failing event answers 500, keeps its error through retries, clears once fixed
    Given a throwaway subscription with agency_id = e2e-not-a-uuid
    When its created and €0 invoice.paid events arrive, and again on a Resend
    Then each answers 500 {"error":"Event failed"}, logged "… agency read failed for e2e-not-a-uuid"
    And both rows keep processed_at empty and that error
    When I delete the agency_id key and Resend both events
    Then each answers "ignored" or "duplicate", rows processed, error cleared, no workspace touched

  @negative
  Scenario: W8 · Another customer's subscription naming E2E-W is a conflict and writes nothing
    Given E2E-W's own subscription is active
    When I create a throwaway-customer subscription with agency_id = E2E-W's id
    Then its created and €0 invoice.paid answer "conflict", each with one error line "… nothing written"
    And E2E-W's Plan & billing, status, period and client slots are unchanged
    When I cancel the new subscription Immediately
    Then it answers "ignored", and its rows are E2E-W's, processed, error-free

  @edge
  Scenario Outline: W13 · An event type the app does not act on is recorded and ignored
    Given <event> is added to the kontuur.app endpoint's events for this test
    When I <cause>
    Then <event> answers "ignored", its row processed with no agency and no error
    And no workspace row changes, and Stripe's Logs show no POST /v1/subscriptions/‹id› after it
    When I remove <event> from the endpoint again
    Then the endpoint lists exactly the six billing events, with no invoice.upcoming
    # No invoice.upcoming in Workbench → Events from the last 30 days: skip that row and say so.

    Examples:
      | event            | cause                                                      |
      | customer.updated | rename the throwaway customer to "E2E-W throwaway w13"     |
      | invoice.upcoming | resend an earlier invoice.upcoming from Workbench → Events |

  @negative @write
  Scenario Outline: W19 · A cron call with a malformed secret or wrong method is refused
    Given E2E-W has reservation e2e-w19: pending 2, count 3, reserved 11 minutes ago
    When I call <method> <route> with <authorization>
    Then it answers HTTP <status> <body>, with no [cron:billing] line
    And the e2e-w19 row still shows pending 2 and count 3

    Examples:
      | method | route                | authorization              | status | body                     |
      | GET    | /api/cron/billing    | "Bearer " and nothing else | 401    | {"error":"Unauthorized"} |
      | GET    | /api/cron/billing    | $CRON_SECRET, no "Bearer"  | 401    | {"error":"Unauthorized"} |
      | GET    | /api/cron/billing    | bearer $CRON_SECRET        | 401    | {"error":"Unauthorized"} |
      | POST   | /api/cron/billing    | Bearer $CRON_SECRET        | 405    |                          |
      | GET    | /api/billing/webhook | no Authorization header    | 405    |                          |

  @positive @core @write
  Scenario: W20 · An authorised run does all three jobs and releases the stale reservation
    Given W19's e2e-w19 reservation is still pending
    When the billing cron runs
    Then it answers 200 with reservationsCleared ≥ 1, one "run complete" line and no "failed:" line
    And the e2e-w19 row shows pending 0, count still 3
    When the billing cron runs again at once
    Then it logs "0 stale reservations cleared; … 0 emailed", and no new bell appears

  @edge @write
  Scenario: W21 · A reservation younger than ten minutes is kept, and a later run releases it
    Given E2E-W has e2e-w21-old (10 min 30 s) and e2e-w21-young (6 min), each pending 1
    When the billing cron runs within 2 minutes
    Then e2e-w21-old shows pending 0, while e2e-w21-young still shows pending 1
    When it runs again once e2e-w21-young is over 10 minutes old
    Then both rows show pending 0 and count 0
    And no reservation anywhere is pending with no reserved_at
    # sql: select count(*) from usage_counters where pending > 0 and reserved_at is null;  -- 0

  @negative @write
  Scenario: W30 · A workspace with a plan never gets a trial reminder
    Given E2E-W, which has a plan, has trial_ends_at in 2 days
    When the billing cron runs
    Then its admin gets no trial bell, banner or email
    And Plan & billing still reads "Active", and no trial_ending row was written

  @edge @write
  Scenario: W35 · An old subscription event delivered late writes today's truth
    Given W1's event was sent before E2E-W's plan was set to end
    And W1's event row is marked unprocessed
    When I resend it from Stripe
    Then it answers "written", the ends-on banner stays, and the row says cancel_at_period_end true
    When I click Keep plan
    Then the banner goes, and the row says false

  @negative @write
  Scenario: W42 · Two simultaneous cron runs send one reminder, to every admin and no member
    Given E2E-W trial has one member, ideally a second admin, and its trial ends tomorrow 12:00 UTC
    When I fire two billing cron runs at once
    Then both answer 200, and E2E-W trial is counted once in total
    And every admin gets one "Your Kontuur trial ends soon" email, and the member only the bell
    And there is exactly one trial_ending row
