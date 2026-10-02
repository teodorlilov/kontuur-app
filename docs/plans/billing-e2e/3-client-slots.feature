Feature: Choosing how many clients I pay for, and what a change costs
  As a Kontuur workspace admin, on the trial or the paid plan
  I want to choose my client slots, and know what a change costs before I confirm it
  So that I pay for the slots I chose, and adding or deleting a client never changes my bill

  @positive @core
  Scenario: 3.1 · Before I pay, I choose how many clients to pay for, and Checkout sells exactly that
    Given I am the agency owner of "QA Clients" on the trial with 2 clients
    When I open Plan & billing
    Then "Clients to pay for" shows 2, and "2 clients × €29.00 = €58.00 a month excl. VAT"
    When I press + beside it, then "Choose plan", and pay as a Bulgarian consumer
    Then Checkout charges me €104.40: 3 × €29.00, plus 20 % VAT
    And Plan & billing shows "Client slots" at 3, and Clients "2 of 3"

  @edge @core
  Scenario: 3.2 · With no clients yet I pay for one, and my first client is included
    Given I am the agency owner of "QA Zero", with no clients yet
    When I open Plan & billing
    Then "Clients to pay for" shows 1, and its − is disabled
    When I press "Choose plan", pay €34.80 as a Bulgarian consumer, and add my first client
    Then I see "Client saved", and my card is not charged again
    And "Add client" now says "Your one client slot is in use. Add a slot to add more."

  @positive
  Scenario: 3.3 · As a business owner I always pay for my one business, with nothing to choose
    Given I am the business owner of "QA Solo" on the trial
    When I open Plan & billing
    Then I see "€29.00 a month excl. VAT for your business" and "Choose plan", with no stepper
    When I press "Choose plan" and pay as a Bulgarian consumer
    Then I am charged €34.80, for one business
    And Plan & billing still shows "€29.00 a month excl. VAT for your business", with no stepper

  @negative
  Scenario Outline: 3.4 · The slot count goes no lower than my clients or one, and no higher than 50
    Given I am the agency owner of "<workspace>" with <n>, <plan>
    When I press − beside the slot count until it is disabled
    Then it shows <min>, and says "<why>"
    When I press + until it is disabled
    Then it shows 50, and "50 clients × €29.00 = €1,450.00 a month excl. VAT"

    Examples:
      | workspace  | n          | plan                      | min | why                                     |
      | QA Clients | 2 clients  | on the trial              | 2   | so you pay for at least 2.              |
      | QA Zero    | no clients | on the trial              | 1   | Room for 1 more client                  |
      | QA Clients | 3 clients  | paying for 3 client slots | 3   | Delete a client first to pay for fewer. |
      | QA Zero    | 1 client   | paying for 1 client slot  | 1   | A plan pays for at least one client.    |

  @positive @core
  Scenario: 3.5 · Adding a slot charges the rest of this month today, with its own invoice
    Given I am the agency owner of "QA Clients", paying for 3 client slots, with 3 clients
    When I press + beside "Client slots", then "Change"
    Then the "Add 1 client slot" dialog says about ‹amount› is charged today "with its own invoice."
    And "From ‹date› you pay €116.00 a month excl. VAT for 4 clients."
    When I press "Add slot"
    Then I see "You now pay for 4 clients.", I pay just under €34.80, and get "Your invoice from Kontuur"

  @edge
  Scenario Outline: 3.6 · The invoice for an added slot carries my own VAT treatment
    Given I am the agency owner of "<workspace>", which paid at Checkout as <customer>
    When I add a client slot: + beside "Client slots", then "Change", then "Add slot"
    Then my card is charged the pro-rata amount, with €0.00 VAT
    And the invoice PDF I am emailed names its VAT as "<basis>"

    Examples:
      | workspace | customer                     | basis                                                  |
      | C-Three   | an EU business with a VAT ID | Reverse charge, Art. 21(2) Bulgarian VAT Act           |
      | QA Abroad | a customer outside the EU    | Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act |

  @edge @clock
  Scenario: 3.7 · A slot added just before my renewal is billed on the renewal invoice
    Given I am the agency owner of "QA Clock", paying for 1 client slot, and my plan renews in under 12 hours
    When I press + beside "Client slots", then "Change"
    Then the dialog says "since it is below the smallest amount a card can be charged."
    When I press "Add slot"
    Then I see "The amount for the rest of this period is added to your next invoice.", and nothing is charged
    And my renewal then charges me once: 2 × €29.00, plus that amount under €0.50, plus VAT

  @negative @core
  Scenario: 3.8 · With every slot in use, "Add client" is refused everywhere, in the same words
    Given I am the agency owner of "QA Clients", paying for 3 client slots, with 3 clients
    When I look at "Add client" on my client list, on the dashboard and in the ⌘K menu
    Then each is disabled with "All 3 client slots are in use. Add a slot to add more."
    And on the client list and at the top of the dashboard a "Plan & billing" link follows it
    When I type the new-client address into the browser, fill in a client and press "Save client →"
    Then I see "All 3 client slots are in use. Add a slot to add more.", and I still have 3 clients

  @positive @core
  Scenario: 3.9 · Deleting a client frees its slot, and my bill stays the same
    Given I am the agency owner of "QA Clients", paying for 4 client slots, with 4 clients
    When I press "Delete client" in one client's Danger zone
    Then the dialog says "This frees one of your 4 client slots."
    And "Your plan still bills for 4; to pay for fewer, lower your slots in Plan & billing."
    When I type the client's name and press "Delete permanently"
    Then I see "‹name› deleted", nothing is charged or refunded, and Clients reads "3 of 4"

  @edge
  Scenario: 3.10 · Deleting my only client frees my one slot, which my plan keeps billing
    Given I am the agency owner of "QA Zero", paying for 1 client slot, with 1 client
    When I press "Delete client" in its Danger zone
    Then the dialog says "This frees your client slot."
    And "Your plan still bills for one client until you cancel it in Plan & billing."
    When I type its name and press "Delete permanently"
    Then I see "‹name› deleted", nothing is refunded, and Clients reads "0 of 1"

  @negative
  Scenario Outline: 3.11 · Deleting a client needs its name typed back, whatever the case or spacing
    Given I am the agency owner of "QA Clients" with a client named "Acme Studio"
    When I press "Delete client" in its Danger zone and type <typed>
    Then "Delete permanently" is <state>
    And after "Cancel" the dialog opens again with an empty field, and the client is still there

    Examples:
      | typed              | state    |
      | "Acme Studi"       | disabled |
      | "AcmeStudio"       | disabled |
      | "  ACME   STUDIO " | enabled  |

  @positive @core
  Scenario: 3.12 · Removing a slot takes effect at my renewal and refunds nothing
    Given I am the agency owner of "QA Clients", paying for 4 client slots, with 3 clients
    When I press − beside "Client slots", then "Change"
    Then "Remove 1 client slot" says "From ‹date› you pay €87.00 a month excl. VAT for 3 clients."
    And "Nothing is refunded, and this period's allowance stays as it is."
    When I press "Remove slot"
    Then I see "From your next renewal you pay for 3 clients. Nothing was charged or refunded."

  @negative @core
  Scenario: 3.13 · After I remove a slot, this month's allowance stays, and my clients are capped at once
    Given I am the agency owner of "QA Clients" with 3 clients, and I have just lowered my slots from 4 to 3
    When I open Plan & billing
    Then it shows "You pay for 4 until ‹date›, then 3.", and AI drafts still "‹used› of 100"
    And Clients reads "3 of 3"
    When I look at "Add client" on my client list
    Then it is disabled with "All 3 client slots are in use. Add a slot to add more."

  @positive @core
  Scenario Outline: 3.14 · Raising my slots back up to what I paid for this month costs nothing
    Given I am the agency owner of "QA Clients" with 3 clients, and "You pay for <paid> until ‹date›, then 3."
    When I press + beside "Client slots" until it reads 4, then "Change"
    Then the dialog says "You already paid for <paid> this period, so nothing is charged today."
    When I press "Add slot"
    Then I see "<toast> Nothing was charged.", and my card is not charged
    And Plan & billing shows <after>

    Examples:
      | paid | toast                                         | after                                   |
      | 4    | You now pay for 4 clients again.              | Clients "3 of 4", with no "You pay for" |
      | 5    | From your next renewal you pay for 4 clients. | "You pay for 5 until ‹date›, then 4."   |

  @edge
  Scenario: 3.15 · Raising past what I paid for this month charges only the slots above it
    Given I am the agency owner of "QA Clients" with 3 clients, and "You pay for 4 until ‹date›, then 3."
    When I press + beside "Client slots" until it reads 5, then "Change"
    Then the "Add 2 client slots" dialog says "1 of them is already paid for this period."
    When I press "Add slots"
    Then I see "You now pay for 5 clients.", and I am charged once, pro rata for 1 slot
    And Plan & billing shows Clients "3 of 5", and AI drafts "‹used› of 125"

  @negative @core @defect-D11
  Scenario Outline: 3.16 · A declined card refuses a new slot, and the declined try is never charged later
    # fails today: unconfirmed; the declined raise may stay due, and a working card may then pay it
    Given I am the agency owner of "<workspace>", paying for <n> client slots, and my default card declines
    When I press + beside "Client slots", "Change" and "Add slot"
    Then I see "The card on file was declined: ‹reason› Update it under Manage billing and try again."
    And the dialog stays open, no "A payment failed" bell appears, and a reload shows "Client slots" at <n>
    When I make a working card my default under "Manage billing", and <next>
    Then I get <result>

    Examples:
      | workspace  | n | next                      | result                                    |
      | QA Clients | 6 | add a slot again          | one charge and one invoice email, no more |
      | QA Window+ | 3 | keep my slots as they are | no charge and no invoice email, ever      |

  @negative @write
  Scenario: 3.17 · After a failed renewal payment, my slots wait until the payment goes through
    Given I am the agency owner of "QA Clients", and my renewal payment was declined
    When I open Plan & billing
    Then it shows "Payment failed", and no stepper, only "Your last payment failed."
    And "Update your card in Plan & billing to continue."
    When my payment goes through
    Then Plan & billing shows "Active" again, with the stepper beside "Client slots"

  @edge
  Scenario: 3.18 · With my plan set to end, my slots cannot change, and deleting a client names no bill
    Given I am the agency owner of "QA Clients", and I pressed "Cancel plan" and confirmed it
    When I open Plan & billing
    Then there is no stepper, only "Your plan ends on ‹date›. Keep your plan to change its client slots."
    When I press "Delete client" in one client's Danger zone
    Then the dialog's text ends "This cannot be undone.", with nothing about my plan or my slots
    And after "Keep plan", Plan & billing shows "Renews on" ‹date› and the stepper beside "Client slots"

  @edge @write
  Scenario: 3.19 · A page left open past my renewal date refreshes itself rather than price a change
    Given I am the agency owner of "QA Clients", with + pressed beside "Client slots" in a second tab
    When my renewal date passes before its payment has gone through, and I press "Change" in that tab
    Then the page refreshes, with no dialog and no message, and the stepper is gone
    And it shows "Your plan is renewing, and its payment is taken within about an hour. …"
    And nothing is charged, and once my renewal is paid the stepper is back

  @edge @clock
  Scenario: 3.20 · A change sent while my plan renews is refused, and a page left open must be reloaded
    Given I am the agency owner of "QA Clock" at 2 client slots, with the "Add 1 client slot" dialog open
    When my plan starts renewing, before its payment goes through, and I press "Add slot"
    Then I see "Your plan is renewing, and its payment is taken within about an hour. …"
    When my renewal is paid, and I press "Add slot" again
    Then I see "Your plan has renewed since this page loaded. Reload the page to see its new period."
    And after a reload "Client slots" reads 2, and "Renews on" shows a date a month later

  @edge
  Scenario: 3.21 · A window still showing my old slot count cannot change my slots
    Given I am the agency owner of "QA Clients", "Client slots" at 4, and Plan & billing open in two windows
    When I add a slot in window A, with +, "Change" and "Add slot"
    And in window B, which still shows 4, I add a slot the same way
    Then window B says "Your client slots were changed in another window. Reload the page and try again."
    And window B's try charges nothing, and after a reload both windows show "Client slots" at 5

  @negative
  Scenario: 3.22 · A window that has not seen my newest client cannot lower my slots below my clients
    Given I am the agency owner of "QA Clients" with 2 clients in 7 client slots
    And in window A I pressed − down to 2, where it says "Delete a client first to pay for fewer."
    When I add a client in window B, then press "Change" and "Remove slots" in window A
    Then window A says "You have 3 clients. Delete a client first to pay for fewer."
    And nothing is changed or charged: after a reload "Client slots" still reads 7

  @edge @write
  Scenario: 3.23 · Another change to my plan still in progress holds mine back at once; a stuck one does not
    Given I am the agency owner of "QA Clients", paying for 5 client slots
    And another change to my plan is still in progress
    When I press + beside "Client slots", "Change" and "Add slot"
    Then I see "Another change to your plan is in progress. Try again in a moment." at once
    When that change has been stuck for 5 minutes, and I press "Add slot" again
    Then I see "You now pay for 6 clients.", and I am charged once, pro rata for 1 slot

  @edge
  Scenario: 3.24 · A double click adds one client, and a client deleted from two tabs is deleted once
    Given I am the agency owner of "QA Clients", with a free client slot
    When I fill in a new client and double-click "Save client →"
    Then I see one "Client saved", and my client list has one client more
    When its delete dialog is filled in two tabs, I double-click "Delete permanently" in one, then the other
    Then the first tab shows one "‹name› deleted", and the second says "Not found"
    And my client slots stay as they were, and nothing is charged or refunded

  @edge
  Scenario Outline: 3.25 · A client added or deleted while Checkout is open: I pay for the slots I chose
    Given I am the agency owner of "<workspace>" on the trial with <n>, and Checkout open for <n>
    When I <change> in another tab, then pay as a Bulgarian consumer
    Then I am charged <charge> for <n>, and Plan & billing shows Clients "<meter>"
    And nothing more is charged or refunded, and "Add client" <add>

    Examples:
      | workspace  | n         | change          | charge  | meter  | add                                    |
      | QA Window+ | 1 client  | add two clients | €34.80  | 3 of 1 | says "Your one client slot is in use." |
      | QA Window− | 3 clients | delete a client | €104.40 | 2 of 3 | is enabled                             |

  @edge
  Scenario: 3.26 · Over my slots after that Checkout, nothing is charged until I add slots myself
    Given I am the agency owner of "QA Window+", and Plan & billing shows Clients "3 of 1" in red
    When I look at "Client slots", and at one client's "Delete client" dialog
    Then it reads 1, its − is disabled, there is no "Change", and the dialog says nothing about my bill
    When I press + once, then "Change"
    Then the count jumped from 1 straight to 3, and the dialog is "Add 2 client slots"
    And "Add slots" brings "You now pay for 3 clients.", one pro-rata charge, and Clients "3 of 3"

  @edge
  Scenario Outline: 3.27 · Two tabs saving at once cannot take me past my cap
    Given I am the agency owner of "<workspace>" with 2 clients, <plan>, a new client filled in two tabs
    When I press "Save client →" in both tabs within a second
    Then one tab says "Client saved" and the other "<refusal>"
    But if both refuse, pressing "Save client →" once more in one tab says "Client saved"
    And I end with exactly 3 clients, and nothing is charged

    Examples:
      | workspace  | plan                      | refusal                                                |
      | QA Window− | on the trial              | Trial includes 3 clients. Choose a plan to add more.   |
      | QA Clients | paying for 3 client slots | All 3 client slots are in use. Add a slot to add more. |

  @negative @core
  Scenario Outline: 3.28 · My teammate sees how many clients we hold, but changes neither slots nor clients
    Given I am a teammate (a member, not an admin) in "QA Clients", <plan>, with <n> clients
    When I open Plan & billing
    Then I see Clients "<meter>", but no stepper, "Choose plan", "Change" or "Manage billing"
    When I look at "Add client" on the client list, the dashboard and the ⌘K menu, and at a Danger zone
    Then each says "Only admins can add or delete clients.", with no Plan & billing link
    And saving the new-client form, opened by its address, says the same, and we keep <n> clients

    Examples:
      | plan                      | n | meter  |
      | on the trial              | 2 | 2 of 3 |
      | paying for 4 client slots | 3 | 3 of 4 |

  @negative
  Scenario: 3.29 · With no clients, my teammate is not offered "Add your first client" anywhere
    Given I am a teammate (a member, not an admin) in "QA Zero", on a paid plan with no clients
    When I open the dashboard
    Then "Add client" is disabled with "Only admins can add or delete clients." and no Plan & billing link
    And Client coverage says "No clients yet." followed by "Only admins can add or delete clients."
    When I open Generate posts, which says "No clients yet"
    Then "Add your first client" is disabled, with "Only admins can add or delete clients."

  @negative @core
  Scenario: 3.30 · As a business owner on the paid plan, I cannot add a second business
    Given I am the business owner of "QA Solo", paying for my one business
    When I look at my dashboard and the ⌘K menu
    Then neither offers "Add client"
    When I type the new-client address into the browser, fill in a second business and press "Save client →"
    Then I see "Your plan covers one business.", and no second business is saved
    And my card is not charged, and Plan & billing still shows Business "1 of 1"

  @edge @write
  Scenario: 3.31 · On Kontuur's internal plan there are no slots to choose, and clients have no cap
    Given I am the agency owner of "QA Clients" with 2 clients, and Kontuur has put us on its internal plan
    When I open Plan & billing
    Then it shows "Internal", "Active" and Clients "2 clients", with no stepper and no "Choose plan"
    When I add a 3rd and a 4th client, then delete both
    Then each says "Client saved", the delete dialogs say nothing about my bill, and nothing is charged
    And my teammate still sees "Add client" disabled with "Only admins can add or delete clients."

  @negative
  Scenario: 3.32 · I cannot open, and so cannot delete, a client of another workspace
    Given I am the agency owner of "QA Clients", holding the settings address of the business in "QA Solo"
    When I open that address
    Then I see a page-not-found screen, with no Danger zone
    When I search the ⌘K menu for that business's name
    Then it says "Nothing matches “‹name›”."
