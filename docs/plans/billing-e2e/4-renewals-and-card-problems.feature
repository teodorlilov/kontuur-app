Feature: Renewing my plan, and fixing a payment that failed
  As the owner of an agency that pays for Kontuur by card
  I want my plan to renew on its own, and to be told plainly when a payment fails and how to fix it
  So that my workspace keeps running and I am never charged for what I did not keep

  Background:
    Given I am the agency owner of "R Clock Test", on Pro, paying by card
    And my workspace's timezone is Sofia

  @core @positive @clock
  Scenario: 4.1 · My plan renews: my card is charged, my allowance starts again, and I get the invoice
    Given I pay for 2 client slots, and this month's "AI drafts" meter shows "1 of 50"
    When my plan renews
    Then my card is charged €69.60, and Plan & billing shows "Active"
    And "Renews on" names the day my plan renews next month, as a date in Sofia
    And the meters start again at "0 of 50", "0 of 210" and "0 of 30"
    And Invoices has a new top row: the next number, "Invoice", today's date, "€69.60" and "Download"

  @core @positive @clock
  Scenario: 4.2 · My renewal invoice comes by email, with Bulgarian VAT on the PDF
    Given my plan for 2 client slots has just renewed
    When I open the email "Your invoice from Kontuur"
    Then it says "Invoice No. ‹number› for €69.60, dated ‹date›, is attached as a PDF."
    And it says "It is also listed under Plan & billing, where every document stays available to download."
    And the attachment is kontuur-‹number›.pdf, and "Open Plan & billing" takes me to that list
    And the PDF bills 2 × €29.00 at tax group "Б", with "Bulgarian VAT (20 %)" €11.60 and total €69.60

  @core @positive @clock
  Scenario: 4.3 · My renewal bills the client slots I chose, not the clients I have
    Given I pay for 2 client slots, and I have deleted one of my 2 clients
    Then Plan & billing shows Clients "1 of 2", "Client slots" 2, and the limits "of 50", "of 210", "of 30"
    When my plan renews
    Then my card is charged €69.60 for my 2 slots, not €34.80 for the 1 client I have
    And no bell, email or banner appeared about it beforehand, and "Client slots" still reads 2

  @core @positive @clock
  Scenario: 4.4 · Changing my card in Manage billing charges nothing, and my next renewal uses it
    Given my plan is active, paid by my card ending 4242
    When I add a new card in "Manage billing" and make it my default
    Then nothing is charged to either card
    And Plan & billing still shows "Active" with the same "Renews on" date, and no banner
    And my next renewal is tried on the new card, not on my old card ending 4242

  @negative
  Scenario: 4.5 · Manage billing changes only my card and billing details, and refuses a card that declines
    Given my plan is active, paid by my card ending 4242
    When I click "Manage billing"
    Then Stripe's billing page lets me change my card, billing address and tax ID
    But it has no way to cancel, to change the plan or the number of client slots, and no invoices
    When I try to save a card that is declined at once, then follow the link back to Kontuur
    Then the card is refused, my card ending 4242 stays, and I land on Plan & billing, unchanged

  @core @negative @clock
  Scenario: 4.6 · My renewal payment is declined: I keep working for 7 days, and I am told how to fix it
    Given I pay for 2 clients, my card declines when charged, and "AI drafts" shows "1 of 50"
    When my renewal payment is declined
    Then every page stays open, and each page with the sidebar has a banner: "Your last payment failed."
    And it asks me to "Update your card by ‹date› to keep your workspace running.", 7 days from today
    And I get one "A payment failed" bell and one "Your Kontuur payment failed" email
    And Plan & billing shows "Payment failed", "Update your card by" ‹date›, no "Renews on", and "1 of 50"

  @negative @clock
  Scenario: 4.7 · The failed-payment email and bell say what happens next and where to fix it
    Given my renewal payment was declined today
    When I open the email "Your Kontuur payment failed"
    Then it repeats the banner's sentence, then "The charge is tried again as soon as the card is updated."
    And it says "After 7 days without a payment the workspace pauses and keeps everything you made."
    And its "Update your card" button opens Plan & billing
    And the bell's "A payment failed" row carries the same sentence and "Open plan & billing →"

  @edge @clock @write
  Scenario Outline: 4.8 · A retry that is declined again sends me nothing new (<state>)
    Given my renewal payment was declined, and <state>
    When the payment is retried and declined again
    Then no second "A payment failed" bell or email arrives
    And I still see <what>

    Examples:
      | state                                     | what                                                 |
      | nothing has changed since                 | the banner, with the same "Update your card by" date |
      | I have set my timezone to Los Angeles     | the same deadline, written as a Los Angeles date     |
      | my 7 days ran out and my workspace paused | the "Workspace paused" wall and "Update your card"   |

  @negative @clock
  Scenario: 4.9 · My teammate sees the failed payment too, but has nothing to act with and gets no email
    Given I have a teammate, and my renewal payment was declined
    When my teammate opens the dashboard, the bell and Plan & billing
    Then my teammate sees the same banner and the same "A payment failed" bell
    And my teammate's Plan & billing shows "Payment failed" and "Update your card by" ‹date›
    But it has no "Cancel plan", no "Manage billing" and no Invoices
    And my teammate gets no "Your Kontuur payment failed" email

  @edge @clock
  Scenario: 4.10 · After a failed payment my client slots cannot change, and a client past them is refused
    Given my renewal payment was declined, and my 2 clients fill my 2 client slots
    Then Plan & billing has no "Client slots" stepper and no "Change"
    And in their place it says "Your last payment failed. Update your card in Plan & billing to continue."
    And on Clients, "Add client" is disabled with "All 2 client slots are in use. Add a slot to add more."
    When I open kontuur.app/clients/new anyway, fill in a client and save
    Then a red toast gives the same sentence, nothing is charged, and I still have 2 clients

  @edge @clock @defect-D11
  Scenario: 4.11 · Fixing my card later never charges me for a slot my card was declined for
    # fails today: unconfirmed; the declined raise may stay due, and fixing my card may then pay it
    Given my plan for 2 client slots is "Active", and my card declines when charged
    When I raise "Client slots" to 3, click "Change", and confirm "Add slot"
    Then I see "The card on file was declined: ‹reason› Update it under Manage billing and try again."
    And after a reload "Client slots" still reads 2, and no new invoice is listed
    When my renewal is declined later, and I then make a working card my default in "Manage billing"
    Then my card is charged €69.60 for the renewal and nothing else, and no invoice for a third slot appears

  @edge @clock
  Scenario: 4.12 · Deleting a client after a failed payment frees a slot, and changes no bill
    Given my renewal payment was declined, and my 2 clients fill my 2 client slots
    When I delete one client
    Then the dialog says "This frees one of your 2 client slots. Your plan still bills for 2; …"
    And Plan & billing then shows Clients "1 of 2", the limits "of 50", "of 210", "of 30" and "Payment failed"
    And no credit note appears under Invoices, nothing is refunded, and "Add client" is enabled again

  @edge @clock @write
  Scenario: 4.13 · At my AI-draft limit after a failed payment, Generate stops, and nothing resets
    Given my renewal payment was declined, and I have used 49 of my 50 AI drafts this month
    Then "AI drafts" reads "49 of 50" in amber, and Generate posts still opens the Generate form
    When I have used all 50
    Then "AI drafts" reads "50 of 50" in red, and Generate posts on the dashboard is disabled
    And it and the Generate page say "You've used all 50 AI drafts for this period. …"
    And Plan & billing still says "Payment failed", nothing resets, and its banner still asks for my card

  @core @edge @clock @write
  Scenario: 4.14 · When my 7 days run out, my workspace pauses and asks for my card
    Given my renewal payment was declined, and my 7 days to fix it end in 10 minutes
    Then Plan & billing shows "Payment failed" and "Update your card by" today's date
    When 11 minutes have passed
    Then Plan & billing shows "Paused", "Cancel plan" and "Manage billing", no "Choose plan", no banner
    And in place of the meters it says "Your workspace is paused because your last payment failed. …"
    And every page with the sidebar but Settings shows the "Workspace paused" wall and "Update your card"

  @negative @clock @write
  Scenario: 4.15 · While paused, I cannot add, edit or generate, and I am not reminded again
    Given my workspace has paused after my declined renewal, with 1 client, and I have not cancelled my plan
    When I open the dashboard, the calendar, Clients or my client's settings
    Then each shows the "Workspace paused" wall, saying "The workspace keeps everything you made."
    And Generate and the new-client page take me to Plan & billing instead
    And "Add client" in the command palette is disabled with "Update your card to add clients."
    And no "Your workspace is paused" bell or email arrives, even the next day

  @negative @clock @write @defect-D10
  Scenario: 4.16 · A paused workspace tells my teammate to ask an admin, not to update a card
    # fails today: the wall tells my teammate "Update your card…", with a button to a page they cannot act on
    Given I have a teammate, and my workspace has paused after my declined renewal
    When my teammate opens the dashboard
    Then the "Workspace paused" wall tells my teammate that the last payment failed
    And it asks my teammate to have an admin update the card, with no "Update your card" button
    And my teammate's Plan & billing says the same, with no "Cancel plan", "Manage billing" or Invoices
    And "Add client" in my teammate's command palette says "Only admins can add or delete clients."

  @core @positive @clock @write
  Scenario: 4.17 · Updating my card pays the renewal I owe, and my workspace opens again
    Given my workspace paused after a declined renewal for 2 client slots, and I have 1 client left
    When I click the wall's "Update your card", then "Manage billing", and make a working card my default
    Then within 2 minutes my card is charged €69.60, the renewal for the 2 slots it billed
    And the wall is gone, and Plan & billing shows "Active", "Renews on" ‹date› and Clients "1 of 2"
    And the meters read "0 of 50", "0 of 210" and "0 of 30", and a new €69.60 invoice is emailed and listed
    And "Client slots" is back at 2, with "Room for 1 more client before you need another slot."

  @edge @clock
  Scenario: 4.18 · A card that needs 3-D Secure, saved in Manage billing, pays my renewal without me
    Given my renewal for 1 client slot was declined, and I have not cancelled my plan
    When I add a card in "Manage billing" that asks for 3-D Secure, confirm it, and make it my default
    Then my renewal is charged €34.80 to that card, with no further confirmation asked of me
    And Plan & billing shows "Active", Clients "1 of 1", "0 of 25", "0 of 105" and "0 of 15", and no banner
    And a new €34.80 invoice is under Invoices and in my email

  @edge @clock
  Scenario: 4.19 · A later renewal that is declined again brings the banner, bell and email back
    Given my last declined renewal was paid once I fixed my card
    And my card now declines when charged
    When my next renewal payment is declined
    Then the banner is back, asking me to update my card by a date 7 days from today
    And Plan & billing shows "Payment failed", and my meters are not reset
    And a new "A payment failed" bell and a new "Your Kontuur payment failed" email arrive

  @edge @clock @write
  Scenario Outline: 4.20 · The day I must update my card by is written in my timezone (<zone>)
    Given my renewal payment was declined <when>
    And I have set my workspace's timezone to <zone>
    When I open Plan & billing and another page with the sidebar
    Then "Update your card by" and the banner both name <date>
    And the "A payment failed" bell still reads the date it was sent with

    Examples:
      | zone        | when                                       | date                                    |
      | Los Angeles | today                                      | the date 7 days on, in Los Angeles      |
      | Sofia       | just after midnight last night, Sofia time | the Sofia date of that day, plus 7 days |

  @edge @clock
  Scenario Outline: 4.21 · My renewal invoice follows the billing details I saved (<details>)
    Given I pay for 1 client with a working card
    When I set my billing details in "Manage billing" to <details>
    And my plan renews
    Then my card is charged <amount>, and the new invoice is under Invoices and in my email
    And the PDF shows my new details, the VAT line "<VAT line>" at <VAT>, and tax group "<group>"

    Examples:
      | details            | amount | VAT line                                               | VAT   | group |
      | Berlin, no tax ID  | €34.80 | Bulgarian VAT (20 %)                                   | €5.80 | Б     |
      | Berlin, DE VAT ID  | €29.00 | Reverse charge, Art. 21(2) Bulgarian VAT Act           | €0.00 | А     |
      | Skopje, no tax ID  | €29.00 | Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act | €0.00 | А     |

  @edge @clock @write
  Scenario: 4.22 · Two renewals declined in a row are both paid once I fix my card
    Given my renewal payment was declined, my 7 days ran out, and my card still declines
    When a month later my next renewal payment is declined too
    Then the "Workspace paused" wall stays, with "Update your card", and no second bell or email arrives
    When I make a working card my default in "Manage billing"
    Then both renewals are charged, and two new invoices are under Invoices and in my email
    And Plan & billing shows "Active", "Renews on" a month after the newer renewal, and fresh meters

  @edge @clock
  Scenario Outline: 4.23 · After the last retry fails, my workspace follows what became of my plan (<outcome>)
    Given my renewal payment was declined, and my card still declines
    When Kontuur's last try to charge my card is declined, and my plan is <outcome>
    Then Plan & billing shows <plan>
    And every page with the sidebar but Settings shows <pages>
    And no new bell or email arrives

    Examples:
      | outcome       | plan                                         | pages                               |
      | ended         | "Paused" and only "Choose plan"              | the wall with "Choose a plan"       |
      | kept on hold  | "Paused", "Cancel plan" and "Manage billing" | the wall with "Update your card"    |
      | left as it is | "Payment failed", unchanged                  | the banner, until my 7 days run out |

  @core @positive @clock
  Scenario: 4.24 · Cancelling while a renewal has failed ends my plan at once, and that payment is never taken
    Given my renewal payment was declined, and I have not cancelled my plan
    When I click "Cancel plan" and confirm "Your plan ends now and the failed payment is not collected; …"
    Then I see "Your plan has ended.", and Plan & billing shows "Paused" with only "Choose plan"
    And it says "Your workspace is paused. Choose a plan to generate, schedule and publish again."
    And every page with the sidebar but Settings shows the "Workspace paused" wall with "Choose a plan"
    And my card is never charged for the failed renewal, not even days later

  @negative @clock
  Scenario: 4.25 · I can delete my workspace once I cancel the plan whose renewal failed
    Given my renewal payment was declined, and I have not cancelled my plan
    Then the Danger zone in Settings says "Cancel your plan first, under Plan & billing."
    And it says the plan "ends at once and the failed payment is not collected"
    When I cancel my plan under Plan & billing
    Then the Danger zone offers "Delete workspace" instead

  @edge @clock @write
  Scenario Outline: 4.26 · A late message about a payment already settled changes nothing I see (<case>)
    Given <before>
    When Stripe sends Kontuur an old message about <payment> again, late
    Then Plan & billing and my other pages look exactly as before, with no banner coming back
    And no new bell, email or Invoices row appears, and my card is not charged

    Examples:
      | case         | before                                            | payment                           |
      | renewal paid | my plan has just renewed and been paid            | my first payment and that renewal |
      | card fixed   | my declined renewal was paid once I fixed my card | the declined renewal              |
      | cancelled    | I cancelled my plan after a renewal failed        | the declined renewal              |

  @edge @clock @write
  Scenario: 4.27 · At my AI-draft limit after a failed payment, the Generate page asks for my card too
    Given my renewal payment was declined, and I have used all 50 of my AI drafts this month
    When I open "Generate posts" in the sidebar
    Then in place of its form the Generate page says "You've used all 50 AI drafts for this period."
    And it goes on "Update your card in Plan & billing to continue.", with a "Plan & billing" link
