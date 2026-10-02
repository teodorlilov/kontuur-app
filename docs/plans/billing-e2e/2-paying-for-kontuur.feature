Feature: Paying for Kontuur
  As the owner of a Kontuur workspace on its trial
  I want to choose the plan and pay for it on Stripe's Checkout
  So that my workspace keeps working, I am charged the right amount once, and I get my invoice

  Background:
    Given my workspace's Timezone, under Settings → Account, is set to Sofia

  @core @positive
  Scenario: 2.1 · Before I pay, I choose how many clients to pay for, and see what Checkout will charge
    Given I am the agency owner of "C-One" on the trial with 1 client
    When I open Plan & billing
    Then "Clients to pay for" reads 1 and goes no lower: "A plan pays for at least one client."
    And "Choose plan" sits beside "1 client × €29.00 = €29.00 a month excl. VAT", with no "Manage billing"
    And its + goes no higher than 50: "50 clients × €29.00 = €1,450.00 a month excl. VAT"
    And Invoices reads "No documents yet — the first payment creates one."

  @core @positive
  Scenario: 2.2 · Checkout sells the number of clients I chose to pay for, at €29.00 a month each
    Given I am the agency owner of "C-One" on the trial with 1 client
    When I set "Clients to pay for" to 3, click "Choose plan" and read Stripe's page without paying
    Then it sells Kontuur, quantity 3, at €29.00 a month each, with no free trial and no promotion code field
    And it asks for my email, a card, a billing address and, if I buy as a business, a tax ID
    And it adds VAT on top of €87.00 only once I have entered my address
    And it will not take my payment until I tick the box that reads:
      """
      I ask for the service to start now and understand that
      if I withdraw within 14 days I pay for the days used.
      """

  @negative
  Scenario Outline: 2.3 · Stripe takes no payment while something it needs is missing or wrong
    Given I am the agency owner of "C-One" on the trial, on Stripe's Checkout
    When I fill in my email, a good card and <details>
    And I <problem> and press Subscribe
    Then Stripe marks <flagged> and takes no payment
    And Plan & billing still shows "Trial" and "Choose plan"

    Examples:
      | details                           | problem                         | flagged                  |
      | a Sofia address                   | leave the consent tick empty    | the tick-box as required |
      | the consent tick                  | clear the address line and city | the address as required  |
      | Berlin, the tick, a business name | give the VAT ID DE123           | the tax ID as invalid    |
      | Berlin, the tick, a business name | give the VAT ID XX123456789     | the tax ID as invalid    |

  @core @negative @defect-D6
  Scenario Outline: 2.4 · A declined card starts no plan, and my trial carries on as before
    # fails today: if Stripe keeps the failed payment as an unfinished subscription, my trial reads Paused
    Given I am the <me> on the trial, on Stripe's Checkout
    When I pay with <card>
    Then Stripe refuses it (<refusal>), stays open for another card, and charges nothing
    When I leave by Stripe's back link and, a minute later, reload Plan & billing and my dashboard
    Then I still see "Trial", the same "Trial ends" date and "Choose plan", and no "Workspace paused" wall
    And "Choose plan" opens Stripe's Checkout again

    Examples:
      | me                           | card                                  | refusal               |
      | agency owner of "C-One"      | a card with insufficient funds        | insufficient funds    |
      | agency owner of "C-One"      | a card that is declined when charged  | card declined         |
      | agency owner of "C-Three"    | a 3-D Secure card, failing the check  | authentication failed |
      | business owner of "E2E Solo" | a card with insufficient funds, twice | insufficient funds    |

  @negative
  Scenario: 2.5 · Leaving Checkout without paying charges nothing, and I am told so once
    Given I am the agency owner of "C-One" on the trial, on Stripe's Checkout, not yet paid
    When I click Stripe's back link
    Then I am back on Plan & billing with the toast "Checkout was cancelled — nothing was charged."
    When I reload the page
    Then no toast shows, and "Choose plan" is still offered
    And clicking it opens a fresh Checkout

  @core @negative
  Scenario: 2.6 · Only my newest Checkout page can take my money
    Given I am the agency owner of "C-One" on the trial, with an unpaid Checkout open in tab A
    When I double-click "Choose plan" in tab B
    Then the button spins once, and one Checkout opens in tab B
    When I fill in tab A's Checkout with a good card, a Sofia address and the tick, and press Subscribe
    Then Stripe says that page has expired or is no longer available
    And my card is not charged, and tab B's Checkout can still be paid

  @edge @defect-D5
  Scenario: 2.7 · Clicking Choose plan in two windows at once still leaves me one page to pay
    # fails today: both windows can get a Checkout that takes payment, so paying in both charges me twice
    Given I am the agency owner of "C-Race" on the trial, and I once opened and left Checkout
    And Plan & billing is open in windows A and B
    When I click "Choose plan" in A and, within half a second, in B
    Then each window opens Checkout or says "Could not open Stripe just now. Please try again in a moment."
    When I try to pay with a good card on every Stripe page that opened
    Then only one payment goes through, any other page says it has expired, and my card is charged once

  @core @positive
  Scenario: 2.8 · I pay with a good card and my plan starts at once
    Given I am the agency owner of "C-One" with 1 client, on the Checkout I opened for 1 client to pay for
    When I pay with a good card as a consumer at a Sofia address, with the tick ticked
    Then my card is charged €34.80, and Stripe brings me back to Plan & billing
    And after a reload it shows "Pro", "Active", and "Renews on" the date one month from today
    And it shows Clients "1 of 1", with "0 of 25" AI drafts, "0 of 105" AI images and "0 of 15" rewrites
    And I see "Client slots" at 1, "Cancel plan" and "Manage billing", and no "Choose plan"

  @core @positive @defect-D2
  Scenario Outline: 2.9 · The card I land on confirms my plan, then leaves on its own
    # fails today: a card still "Activating" vanishes at its first refresh (~3 s) without "You’re on Pro"
    Given I am the <me>, and Stripe has just brought me back after I paid
    When I watch the card under the Settings tabs for 20 seconds, then reload
    Then the card first reads "Payment received", marked "Activating"
    And within seconds it reads "You’re on Pro", marked "Active", and says my invoice is on its way by email
    And it shows <label> <count>, the number I paid for, "<month> excl. VAT" a month, and its renewal date
    And about 8 seconds later it fades away, and the reload does not bring it back

    Examples:
      | me                         | label    | count | month  |
      | agency owner of "C-One"    | Clients  | 1     | €29.00 |
      | agency owner of "C-Three"  | Clients  | 3     | €87.00 |
      | business owner of "C-Solo" | Business | 1     | €29.00 |

  @core @positive
  Scenario: 2.10 · My first invoice comes by email and stays under Invoices
    Given I am the agency owner of "C-One", and I have just paid €34.80 as a consumer in Sofia
    When I reload Plan & billing and open the mailbox I typed at Checkout
    Then Invoices lists one row: a ten-digit number, "Invoice", today's date, "€34.80" and "Download"
    And one email, "Your invoice from Kontuur", has kontuur-‹number›.pdf and an "Open Plan & billing" button
    And it says "Invoice No. ‹number› for €34.80, dated ‹date›, is attached as a PDF."
    And the PDF: Chelling Ltd, "VAT: BG206770508", tax group Б, "Bulgarian VAT (20 %)" €5.80, €34.80, a QR

  @edge
  Scenario: 2.11 · As a German business with a VAT ID, I pay for my 3 clients with no VAT added
    Given I am the agency owner of "C-Three" with 3 clients, on the Checkout I opened for 3 clients to pay for
    When I pay as C-Three GmbH, Berlin, VAT ID DE123456789, and pass my bank's 3-D Secure check
    Then my card is charged €87.00 for 3 × €29.00, with €0.00 VAT as a reverse charge
    And on reload Plan & billing shows "Pro", "Active", Clients "3 of 3", "0 of 75", "0 of 315", "0 of 45"
    And my invoice email says "Invoice No. ‹number› for €87.00, dated ‹date›, is attached as a PDF."
    And the PDF shows "VAT: DE123456789" and "Reverse charge, Art. 21(2) Bulgarian VAT Act" at €0.00

  @edge
  Scenario: 2.12 · Outside the EU, I pay €29.00 with no VAT, for my one business
    Given I am the business owner of "C-Solo" on the trial, shown "€29.00 a month excl. VAT for your business"
    When I press "Choose plan" and pay with a good card as a consumer at a New York address
    Then my card is charged €29.00, with no VAT added
    And on reload Plan & billing shows "Pro", "Active", Business "1 of 1", "0 of 25", "0 of 105", "0 of 15"
    And my invoice email says "Invoice No. ‹number› for €29.00, dated ‹date›, is attached as a PDF."
    And the PDF's VAT line reads "Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act" at €0.00

  @core @negative
  Scenario: 2.13 · Once I have paid, nothing repeated charges me twice or sends a second invoice
    Given I am the agency owner of "C-One", paying, and a tab from before I paid still shows "Choose plan"
    When Stripe tells Kontuur about my payment a second time
    Then I still have one row under Invoices and one invoice email
    When I click "Choose plan" in the old tab
    Then I am told "This workspace already has a plan. Manage it in Plan & billing."
    And Stripe's Checkout does not open, and nothing more is charged

  @negative @defect-D2
  Scenario: 2.14 · While Kontuur has not heard of my payment, the card I land on waits with me
    # fails today: the card vanishes at its first refresh, about 3 s in, and never reaches "Pending"
    Given I am the agency owner of "C-Late" on the trial, and Kontuur is not hearing of payments for now
    When I pay at Checkout with a good card as a consumer in Sofia, then watch the page for 70 seconds
    Then a card reads "Payment received", marked "Activating"
    And it says "Stripe confirmed your payment. Your plan appears here in a few seconds."
    And after about a minute it is marked "Pending" instead
    And it says "Your plan will show here within a minute. Nothing more to do — refresh if it does not."

  @edge
  Scenario: 2.15 · When Kontuur hears of my payment late, I cannot pay twice, and my plan still arrives
    Given I am the agency owner of "C-Late", I have paid, and Kontuur has not heard of it yet
    When I click "Choose plan", which Plan & billing still offers
    Then I am told "Your plan is being activated — it appears here in a few seconds."
    And Stripe's Checkout does not open, and nothing more is charged
    When Kontuur finally hears of my payment
    Then after a reload Plan & billing shows "Pro", "Active" and one €34.80 invoice; one invoice email arrives

  @edge @write
  Scenario: 2.16 · After my trial ended, and even once my workspace paused, I can pay and start afresh
    Given I am the agency owner of "C-Lapsed" with 1 client, and my trial ended 3 days ago
    Then Plan & billing shows "Trial ended", that my posts go out until a red pause date, and "Choose plan"
    When 7 more days have passed
    Then my dashboard shows the "Workspace paused" wall; Plan & billing shows "Paused" and "Choose plan"
    When I pay at Checkout with a good card as a consumer in Sofia
    Then after a reload Plan & billing says "Active", "Renews on" a month from today; my dashboard has no wall

  @negative
  Scenario Outline: 2.17 · Opening an old link to the page Stripe sends me back to changes nothing
    Given I am the agency owner of a workspace that <state>
    When I open an old link to the page Stripe sends me back to <after>, saved or typed by hand
    Then I see <shown>
    And my plan is unchanged, and nothing is charged

    Examples:
      | state      | after         | shown                                                                  |
      | never paid | after paying  | a "Payment received" card, though I have paid nothing                  |
      | is paying  | after paying  | the "You’re on Pro" card, again saying my latest invoice is on its way |
      | is paying  | after leaving | the toast "Checkout was cancelled — nothing was charged."              |

  @negative
  Scenario: 2.18 · With a credit on my account, I pay less and my plan starts, but no invoice comes
    Given I am the agency owner of "C-Credit" on the trial, with a €5.00 credit on my account at Stripe
    When I pay at Checkout with a good card as a consumer in Sofia
    Then my card is charged €29.80, and after a reload Plan & billing shows "Pro" and "Active"
    But Invoices still reads "No documents yet — the first payment creates one."
    And no invoice email arrives
    And if the card I land on reaches "You’re on Pro", it still says my invoice is on its way by email

  @negative @write
  Scenario: 2.19 · As a teammate, I cannot start Checkout, even from a tab left open from when I was an admin
    Given I am a teammate in "C-One", still on its trial, who was briefly an admin, with a tab from then
    And that tab still shows "Choose plan", and I am a member again
    When I click "Choose plan" in that tab
    Then I am told "Only admins can manage the plan."
    And Stripe's Checkout does not open

  @negative @write
  Scenario: 2.20 · On Kontuur's internal plan my workspace buys nothing, even from an old tab
    Given I am the agency owner of "C-House" on the trial, and tab A shows "Choose plan"
    When Kontuur moves my workspace onto its internal plan
    Then Plan & billing in a new tab shows "Internal" and "Active", and no billing buttons
    When I click "Choose plan" in tab A
    Then I am told "This workspace already has a plan. Manage it in Plan & billing."
    And Stripe's Checkout does not open

  @negative
  Scenario: 2.21 · If Kontuur cannot open Stripe, I am told in one sentence and nothing is charged
    Given I am the agency owner of "C-House" on the trial, and Kontuur's price is set up wrongly
    When I click "Choose plan"
    Then I am told "Could not open Stripe just now. Please try again in a moment."
    And the button can be pressed again, and nothing is charged
    When Kontuur puts its price right and I click "Choose plan" again
    Then Stripe's Checkout opens as usual

  @negative @defect-D4
  Scenario: 2.22 · Even if my billing record at Stripe was deleted, Choose plan still opens Checkout
    # fails today: every click says "Could not open Stripe just now. Please try again in a moment." for good
    Given I am the agency owner of "C-Deleted" on the trial, and I once opened and left Checkout
    And my customer record at Stripe has since been deleted
    When I click "Choose plan"
    Then Stripe's Checkout opens
    When I pay there with a good card as a consumer in Sofia
    Then after a reload Plan & billing shows "Pro" and "Active"
