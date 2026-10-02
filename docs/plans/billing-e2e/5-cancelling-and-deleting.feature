Feature: Cancelling, coming back, and deleting the workspace
  As the owner of a Kontuur workspace
  I want to end my plan, change my mind, come back later, or delete the workspace for good
  So that I pay only while I use Kontuur, and can leave cleanly with my invoices kept

  Background:
    Given "X Test One" was set up as an agency workspace with its owner, one teammate and 2 clients
    And "X Test Two" was set up as an agency workspace with 1 client, and "X Test Solo" as a solo workspace

  @core @positive
  Scenario: 5.1 · I cancel my plan, and it is set to end on its renewal date
    Given I am the agency owner of "X Test One", on Pro, "Active" with "Renews on" ‹D›
    When I click "Cancel plan" and confirm "Your plan ends on ‹D›. You keep full access until then; …"
    Then the toast reads "Your plan is set to end."
    And without a reload the row reads "Ends on" ‹D›, and the button is now "Keep plan"
    And every page shows "Your plan ends on ‹D› — renew in Plan & billing to keep generating."
    And the Danger zone of Settings → Account now offers "Delete workspace"

  @core @positive
  Scenario: 5.2 · I change my mind with one click on Keep plan
    Given I am the agency owner of "X Test One", and my plan is set to end on ‹D›
    When I click "Keep plan"
    Then no dialog opens, and the toast reads "Your plan continues."
    And without a reload the row reads "Renews on" ‹D›, and the button is "Cancel plan" again
    And the ends-on banner is gone from every page
    And the Danger zone drops "Delete workspace" and says "Cancel your plan first, under Plan & billing."

  @negative
  Scenario Outline: 5.3 · A tab I left open cannot cancel or keep my plan a second time
    Given I am the agency owner of "X Test One", and a tab I have not reloaded still shows "<button>"
    And my plan is now <now>
    When I click "<button>" in that tab, confirming (even with a double click) if a dialog asks
    Then one red toast reads "<message>"
    And nothing about my plan or my card changes
    And after a reload the tab shows <after>

    Examples:
      | button      | now        | message                             | after                             |
      | Cancel plan | set to end | There is no running plan to cancel. | "Ends on" ‹D› and "Keep plan"     |
      | Keep plan   | running    | Your plan is not set to end.        | "Renews on" ‹D› and "Cancel plan" |

    @clock
    Examples:
      | button      | now        | message                             | after                             |
      | Keep plan   | ended      | Your plan is not set to end.        | "Paused" and "Choose plan"        |
      | Cancel plan | ended      | There is no running plan to cancel. | "Paused" and "Choose plan"        |

  @negative
  Scenario: 5.4 · My teammate sees when the plan ends, but cannot cancel, keep or delete
    Given I am the agency owner of "X Test One", and my plan is set to end on ‹D›
    When my teammate, a member, opens Settings → Account
    Then they see "Current plan" Pro, "Status" Active and "Ends on" ‹D›, with the ends-on banner above
    And they see no "Keep plan" and no "Manage billing"
    And they see no invoices and no Danger zone

  @edge
  Scenario Outline: 5.5 · My plan's dates are the days they fall on in my workspace's time zone
    Given I am the agency owner of "X Test One", "Active" and not set to end
    When I set "Timezone" to <city> under Settings → Account and save
    Then "Renews on" shows the day my renewal falls on in <city>
    And the "Cancel plan" dialog's "Your plan ends on ‹date›" names that same day
    And nothing about my plan or my card changes

    Examples:
      | city     |
      | Auckland |
      | Honolulu |
      | Sofia    |

  @edge @write @clock
  Scenario: 5.6 · On the Internal plan, cancelling stops only the billing
    Given I am the business owner of "X Test Solo", on "Internal", "Active", yet my card is billed monthly
    When I click "Cancel plan" and confirm "Billing for this workspace stops and nothing more is charged."
    Then the toast reads "Your plan is set to end.", and the button becomes "Keep plan"
    And there is no "Ends on" row and no banner
    When the renewal date passes
    Then my card is not charged; Plan & billing still shows "Internal" and "Active", with no wall or banner

  @edge @clock
  Scenario: 5.7 · I cancel an hour before the renewal, and the renewal never charges me
    Given I am the agency owner of "X Test One", and my plan renews on ‹D›, an hour from now
    When I click "Cancel plan" and confirm
    Then Plan & billing reads "Ends on" ‹D›, and the ends-on banner shows on every page
    When ‹D› passes
    Then my card is not charged, and no invoice email arrives
    And my workspace is paused

  @core @positive @clock
  Scenario: 5.8 · When my plan runs out, the workspace pauses and keeps everything
    Given I am the agency owner of "X Test One", and my plan ran out on ‹D›
    When my teammate and I each open any page other than Settings
    Then each of us sees the "Workspace paused" card, which says "The workspace keeps everything you made."
    And it also says "Your workspace is paused. Choose a plan to generate, schedule and publish again."
    And Plan & billing shows "Paused", "2 clients", "Choose plan", and my earlier invoices
    And there is no banner, and neither of us gets a bell or an email about the plan ending

  @core @positive @clock
  Scenario: 5.9 · I come back after my plan ran out, and start a fresh plan
    Given I am the agency owner of "X Test One", paused with 2 clients, and it is just past midnight in Sofia
    Then "Clients to pay for" starts at 2, beside "2 clients × €29.00 = €58.00 a month excl. VAT"
    When I click "Choose plan" and pay €69.60 (€58.00 plus 20 % VAT) at Checkout with card 4242, from Sofia
    Then my card is charged €69.60 once, and an invoice email for €69.60 arrives
    And after a reload Plan & billing shows "Active", Clients "2 of 2", and "Renews on" a month on, in Sofia
    And the paused card is gone, my allowances start again from 0, and both invoices are listed

  @edge @clock
  Scenario: 5.10 · I come back after a failed payment, and the unpaid renewal is not charged
    Given I am the agency owner of "X Test One", whose plan I cancelled after a renewal payment failed
    When I keep "Clients to pay for" at 2 and click "Choose plan"
    And I pay with card 4242 as a business in Berlin, Germany, with VAT DE123456789
    Then my card is charged €58.00 with no VAT (reverse charge), and nothing for the unpaid renewal
    And after a reload Plan & billing shows "Active", with no banner
    And the Danger zone again says "You keep access until it ends, and can delete the workspace right after."

  @edge
  Scenario: 5.11 · Kontuur support ends my plan at once, and my workspace pauses
    Given I am the agency owner of "X Test One", "Active", and I have deleted both my clients
    When Kontuur support ends my plan at once, with no refund, and I reload Plan & billing
    Then it shows "Paused" and "0 clients", and I get no refund or credit note
    And "Clients to pay for" reads 1 and goes no lower, beside "1 client × €29.00 = €29.00 a month excl. VAT"
    And every other page shows the "Workspace paused" card with "Choose a plan"

  @edge
  Scenario: 5.12 · I come back the same day with no clients, from outside the EU
    Given I am the agency owner of "X Test One", paused with 0 clients
    And the plan I had earlier today already used some AI drafts
    When I click "Choose plan" for 1 client, pay with card 4242 from New York, United States, and reload
    Then I am charged €29.00, and my invoice reads "Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act"
    And Plan & billing shows "Active", Clients "0 of 1", and AI drafts, AI images, Rewrites of 25, 105, 15
    And the AI drafts used earlier today still count against the 25

  @edge @clock
  Scenario: 5.13 · I cancel right after a renewal payment failed, before Kontuur shows it
    Given I am the agency owner of "X Test One", and my renewal payment was declined minutes ago
    And Plan & billing still shows "Active" and "Renews on" ‹D›
    When I click "Cancel plan" and confirm, though the dialog still says my plan ends on ‹D›
    Then the toast reads "Your plan has ended.", and Plan & billing shows "Paused" and "Choose plan"
    And the declined renewal is never charged
    And no "A payment failed" bell and no "Your Kontuur payment failed" email arrive afterwards

  @edge
  Scenario: 5.14 · Kontuur support already ended my plan, and my page has not caught up
    Given I am the agency owner of "X Test Two", and Kontuur support has just ended my plan at once
    And even after a reload, Plan & billing still shows "Active"
    When I click "Cancel plan" and confirm
    Then a red toast reads "Could not open Stripe just now. Please try again in a moment."
    When Kontuur catches up and I reload
    Then Plan & billing shows "Paused" and "Choose plan", and nothing was charged or refunded

  @edge
  Scenario: 5.15 · Kontuur support sets my plan to end, and Keep plan still undoes it
    Given I am the agency owner of "X Test Two", "Active" with "Renews on" ‹E›
    When Kontuur support sets my plan to end on ‹E›, and I reload
    Then Plan & billing reads "Ends on" ‹E› with "Keep plan", and every page shows the ends-on banner
    And the "Delete this workspace" dialog ends "Your plan ends on ‹E›."
    When I click "Keep plan"
    Then the toast reads "Your plan continues.", and the row reads "Renews on" ‹E› again

  @core @positive
  Scenario: 5.16 · Once my plan is set to end, the delete dialog says what goes and what stays
    Given I am the agency owner of "X Test One", and my plan is set to end on ‹D›
    When I click "Delete workspace" in the Danger zone of Settings → Account
    Then the "Delete this workspace" dialog lists "2 clients", "2 members and their accounts" and every post
    And it says "Invoices already issued are kept for ten years as the law requires"
    And it ends "Your plan ends on ‹D›."
    And "Delete permanently" stays disabled until I type the workspace's name

  @negative
  Scenario: 5.17 · The name I type must match the workspace's name as it is now
    Given I am the agency owner of "X Test One", my plan is set to end, and the delete dialog is open
    When I type "X Test On"
    Then "Delete permanently" stays disabled
    When I retype it as "  x test   one ", and in another tab rename the workspace "X Test One Renamed"
    And I click the now enabled "Delete permanently" in the dialog
    Then a red toast reads "The name does not match.", and nothing is deleted

  @core @negative
  Scenario Outline: 5.18 · While my plan still runs, a delete dialog left open from earlier is refused
    Given I am the agency owner of "X Test One", and a tab still offers "Delete workspace" from earlier
    And since then I kept the plan, and now <now>
    When I type "X Test One" in that tab's dialog and click "Delete permanently"
    Then a red toast says "Cancel your plan first, under Plan & billing.", adding that <rest>
    And after a reload that tab shows "<status>" and "Cancel plan", with no "Delete workspace"
    And my workspace, clients and teammate are all still there

    Examples:
      | now                | status         | rest                                                    |
      | it runs as normal  | Active         | I keep access until it ends                             |

    @clock
    Examples:
      | now                | status         | rest                                                    |
      | its renewal failed | Payment failed | it ends at once and the failed payment is not collected |

  @negative @write
  Scenario: 5.19 · If I stop being an admin while the delete dialog is open, the delete is refused
    Given I am the agency owner of "X Test One", my plan is set to end, and I typed "X Test One" to delete
    And meanwhile my role in the workspace is changed to member
    When I click "Delete permanently" without reloading
    Then a red toast reads "Only admins can delete the workspace.", and nothing is deleted

  @core @positive
  Scenario: 5.20 · I delete my workspace, land on a goodbye page, and my login is gone
    Given I am the agency owner of "X Test Two", and my plan is set to end on ‹E›
    When I type "X Test Two" in the "Delete this workspace" dialog and double-click "Delete permanently"
    Then I land on "Your workspace is gone", which says invoices are kept "for at least ten years"
    And it offers "Create a new workspace" and "Back to kontuur.app"
    And opening kontuur.app/settings brings up the sign-in dialog, and my password no longer signs me in
    And nothing is refunded, and nothing more is charged

  @negative
  Scenario: 5.21 · A window left open on my deleted workspace can do nothing
    Given I, the agency owner, deleted "X Test Two" minutes ago, and a window I left open shows "Keep plan"
    When I click "Keep plan" in that window
    Then one red toast reads "There is no running plan to cancel." or "User not found"
    When I type "X Test Two" in that window's delete dialog and click "Delete permanently"
    Then one red toast reads "Only admins can delete the workspace." or "User not found"
    And nothing is charged, refunded or restarted

  @positive @write @clock
  Scenario: 5.22 · My plan has ended, so I delete my business's workspace straight away
    Given I am the business owner of "X Test Solo", and Plan & billing shows "Paused" since my plan ended
    When I click "Delete workspace"
    Then the dialog lists "your business", "your account" and every post, image and report
    And it has no "Your plan ends on" line
    When I type "X Test Solo" and click "Delete permanently"
    Then I land on "Your workspace is gone"

  @edge @defect-D1
  Scenario Outline: 5.23 · A Checkout I left open cannot be paid once my workspace is deleted
    # fails today: I am charged, and a plan with no workspace renews every month; nothing in Kontuur stops it
    Given I am the <owner> of <workspace>, <state>
    And I clicked "Choose plan" in one tab and left Stripe's Checkout there unpaid
    When I delete the workspace in another tab and land on "Your workspace is gone"
    And I go back to the Checkout tab and try to pay with card 4242 4242 4242 4242
    Then Checkout no longer takes the payment, and my card is not charged
    And no invoice email arrives, and nothing is charged next month

    Examples:
      | owner          | workspace     | state                       |
      | agency owner   | "C-Gone"      | on its trial                |

    @write @clock
    Examples:
      | owner          | workspace     | state                       |
      | business owner | "X Test Solo" | paused after its plan ended |

  @core @positive
  Scenario: 5.24 · I sign up again with the same email and start over with a fresh trial
    Given I deleted "X Test Solo" as its business owner, and I am on "Your workspace is gone"
    When I click "Create a new workspace" and sign up again with the same email
    And I confirm my email and set up my business
    Then Plan & billing shows "Trial", with "Trial ends" 14 days from today, and "Choose plan"
    And Invoices reads "No documents yet — the first payment creates one."
    And nothing of the old workspace comes back

  @edge
  Scenario: 5.25 · Kontuur support starts a plan for me by hand, and my workspace stays paused
    Given I am the agency owner of "X Test Two", "Paused" with 1 client
    When Kontuur support starts a plan for me by hand, and my card is charged for it
    Then after a reload Plan & billing still shows "Paused" and "Choose plan"
    When I click "Choose plan"
    Then a red toast reads "Your plan is being activated — it appears here in a few seconds."
    And no Checkout opens
