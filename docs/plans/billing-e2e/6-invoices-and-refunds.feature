Feature: Getting my invoices, credit notes and refunds
  As the admin of a Kontuur workspace
  I want an invoice for every payment and a credit note for every refund, by email and in Settings
  So that my books hold the right document, with the right VAT, for every euro that moved

  Background:
    Given the plan costs €29.00 a month per client slot (per business in a solo workspace), excl. VAT
    And my invoices and credit notes go to the email address I typed at Stripe's Checkout
    And "Invoices" is the section under "Plan & billing" in Settings, on the "Account" tab
    And adding a client slot means: + beside "Client slots" in Plan & billing, then "Change", then "Add slot"

  @core @positive
  Scenario: 6.1 · My first payment brings one invoice email with the PDF attached
    Given I am the agency owner of "E2E Sofia", on trial with 1 client
    When I pay my first Checkout by card, with a Sofia address and no business tax ID
    Then exactly one "Your invoice from Kontuur" email arrives, with kontuur-‹number›.pdf attached
    And it reads "Invoice No. ‹number› for €34.80, dated ‹date›, is attached as a PDF."
    And its "Open Plan & billing" button opens Settings on the Account tab, and Stripe sends no receipt
    And Invoices lists one row: ‹number› in ten digits, "Invoice", ‹date›, "€34.80" and "Download"

  @core @positive
  Scenario: 6.2 · My invoice PDF states everything a Bulgarian sale document must
    Given I am the agency owner of "E2E Sofia", with the PDF of my first €34.80 invoice
    When I open the PDF
    Then it shows:
      | part       | shows                                                                         |
      | top right  | "Invoice" · "No. ‹number›" · "Issued ‹date›" · "Tax point ‹the day I paid›"   |
      | seller     | "Chelling Ltd" · "27 Gabar St, 1320 Bankya, Bulgaria"                         |
      | seller ids | "Reg. no. (UIC): 206770508" · "VAT: BG206770508"                              |
      | e-shop     | "E-shop: kontuur.app — NRA no. ‹number›"                                      |
      | customer   | my name · my street · 1000 Sofia, BG · my email, and no "VAT:" line           |
      | payment    | Order in_… · Transaction ch_… · "Card payment, Stripe" · "Virtual POS: ‹id›"  |
      | line       | the plan, its dates under it · tax group Б · Qty 1 · Unit €29.00 · Net €29.00 |
      | totals     | "Net" €29.00 · "Bulgarian VAT (20 %)" €5.80 · "Total" €34.80                  |
      | QR code    | the text under it: ‹NRA no.›*in_…*ch_…*‹issue date›*‹issue time›*34.80        |
      | footer     | "Document under Art. 52o of Regulation N-18," and the rest of its sentence    |
    And the QR code's date and time are the moment of issue in Sofia
    And my phone's camera reads the QR code as the same text that is printed under it

  @core @positive
  Scenario Outline: 6.3 · The VAT on my invoice follows where I am and whether I buy as a business
    Given I am the agency owner of "E2E <city>", on trial with 1 client
    When I pay my first Checkout by card, with an address in <city>, as <I pay as>
    Then my card is charged <total>, and Invoices lists one "Invoice" of "<total>"
    And the email reads "Invoice No. ‹number› for <total>, dated ‹date›, is attached as a PDF."
    And the PDF shows "Net" €29.00, the VAT line "<VAT line>" and "Total" <total>

    Examples:
      | city          | I pay as           | total  | VAT line                                               |
      | Munich        | a consumer         | €34.80 | Bulgarian VAT (20 %)                                   |
      | Berlin        | a firm with VAT ID | €29.00 | Reverse charge, Art. 21(2) Bulgarian VAT Act           |
      | San Francisco | a consumer         | €29.00 | Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act |
      | Zurich        | a firm with VAT ID | €29.00 | Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act |

  @positive
  Scenario Outline: 6.4 · My invoice names me as I did at Checkout, with my tax number if I gave one
    Given I am the agency owner of "E2E <city>", with the PDF of my first invoice from 6.3
    When I read its customer block
    Then it lists my name, my street, <town line> and my email, one to a line
    And between my town and my email it shows <tax line>
    And every line of the invoice carries tax group <group>

    Examples:
      | city          | town line                   | tax line                         | group |
      | Munich        | 80331 München, DE           | no tax number                    | Б     |
      | Berlin        | 10117 Berlin, DE            | "VAT: DE123456789"               | А     |
      | San Francisco | 94105 San Francisco, CA, US | no tax number                    | А     |
      | Zurich        | 8001 Zürich, CH             | "Reg. no.: CHE-123.456.789 MWST" | А     |

  @core @positive
  Scenario: 6.5 · Adding a client slot mid-month brings its own invoice for the pro-rata charge
    Given I am the agency owner of "E2E Sofia", paying for 1 client
    When I add a client slot, whose confirm says it "is charged today for the rest of this period"
    Then my card is charged pro rata, and one more "Your invoice from Kontuur" email arrives for that amount
    And Invoices lists that invoice on top, with a higher number than my first
    And its PDF has one row per part of the charge, such as unused and remaining time, each with its dates
    And its "Net", its "Bulgarian VAT (20 %)" line and its "Total" add up to what my card was charged

  @core @positive @clock
  Scenario: 6.6 · Each renewal brings its own invoice for the new month
    Given I am the agency owner of "E2E Sofia", paying for 2 clients
    When my plan renews
    Then my card is charged €69.60, and one "Your invoice from Kontuur" email arrives for it, dated today
    And Invoices gets a new top row: a higher number, today's date, "Invoice" and "€69.60"
    And the PDF's line is dated with the new month, and its "Tax point" is the day the renewal was paid

  @edge @clock
  Scenario: 6.7 · A renewal declined and paid a day later brings one invoice, dated by the payment
    Given I am the agency owner of "E2E Sofia", paying for 2 clients with a card that will be declined
    When my renewal payment is declined
    Then no invoice email arrives, and Invoices gains no row
    When I make a working card my default under "Manage billing", and a day passes
    Then exactly one "Your invoice from Kontuur" email for €69.60 arrives, and one new "Invoice" row
    And its "Tax point" is the day the payment went through, not the day the renewal was first declined

  @core @positive
  Scenario: 6.8 · A full refund brings me a credit note, by email and in Invoices
    Given I am the agency owner of "E2E Sofia", with my first €34.80 invoice No. ‹N1› in Invoices
    When Kontuur refunds that invoice in full, €34.80 back to my card
    Then exactly one "Your credit note from Kontuur" email arrives, with kontuur-‹number›.pdf attached
    And it reads "Credit note No. ‹number› for €34.80, dated ‹today›, is attached as a PDF."
    And Invoices gains a top row "Credit note" · today's date · "€34.80" · "Download"; my plan is unchanged
    And the PDF's line reads "Credit note to invoice No. ‹N1› of ‹its date›", "Bulgarian VAT (20 %)" €5.80

  @positive @clock
  Scenario Outline: 6.9 · Each refund Kontuur records gives me a credit note for exactly what it returns
    Given I am the agency owner of "E2E Sofia", with my <invoice> invoice in Invoices
    When Kontuur credits <credit>
    Then Invoices gains a "Credit note" row of <total>, and one credit-note email arrives
    And the PDF's one line reads "Credit note to invoice No. ‹that invoice› of ‹its date›", Net <net>
    And its "Total" is <total>, and its Transaction is <transaction>
    And its Order is cn_…, and the text under its QR code reads ‹NRA no.›*cn_…*‹that Transaction›*…*‹amount›

    Examples:
      | invoice      | credit                                | net    | total       | transaction        |
      | 6.6 renewal  | all of it, after my bank's chargeback | €58.00 | €69.60      | the renewal's ch_… |
      | 6.5 slot     | €5.00 of it plus VAT, to my card      | €5.00  | about €6.00 | the refund's re_…  |
      | 6.5 slot     | €0.01 of it, to my card               | €0.01  | €0.01       | the refund's re_…  |

  @edge
  Scenario: 6.10 · Two part refunds of one invoice give me two credit notes that add up to what I paid
    Given I am the agency owner of "E2E Berlin", with my €29.00 reverse-charge invoice from 6.3
    When Kontuur refunds €10.00 of it to my card, and later the other €19.00
    Then Invoices gains two "Credit note" rows, "€10.00" and "€19.00", and two credit-note emails arrive
    And each PDF reads "Credit note to invoice No. ‹that invoice› of ‹its date›", its refund as Transaction
    And each keeps "VAT: DE123456789" and "Reverse charge, Art. 21(2) Bulgarian VAT Act" at €0.00

  @negative @clock
  Scenario Outline: 6.11 · A charge Kontuur cannot document, or a renewal my card did not pay, has no invoice
    Given I am the agency owner of "E2E <city>", paying for 1 client
    When <what happens>
    Then my card is charged <charged>
    But no new "Invoice" row appears in Invoices, and no invoice email arrives

    Examples:
      | city   | what happens                                                                | charged  |
      | Berlin | Kontuur bills me a one-off €10.00 outside my plan                           | €10.00   |
      | Munich | my plan renews and also collects €5.00 I owed from before                   | €39.80   |
      | Munich | Kontuur gives me my next month free, and my plan renews                     | nothing  |
      | Munich | Kontuur takes €5.00 off my declined renewal, then I pay the rest            | the rest |
      | Munich | Kontuur records my unpaid renewal as paid another way, with no card on file | nothing  |
      | Munich | my plan renews, paid in full from credit Kontuur gave me                    | nothing  |

  @negative @clock
  Scenario Outline: 6.12 · Money returned in a way Kontuur cannot document brings me no credit note
    Given I am the agency owner of "E2E <city>", and my card paid <invoice>
    When Kontuur <returns>
    Then <back> comes back to my card
    But no "Credit note" row appears in Invoices, and no credit-note email arrives

    Examples:
      | city          | invoice                 | returns                                         | back    |
      | San Francisco | my €29.00 first invoice | refunds all of it, with no credit note          | €29.00  |
      | Sofia         | the renewal from 6.7    | refunds €10.00 to my card, the rest another way | €10.00  |
      | Zurich        | my €29.00 first invoice | keeps all of it as credit for my next payments  | nothing |
      | Berlin        | the one-off from 6.11   | refunds all of it to my card                    | €10.00  |

  @core @negative
  Scenario Outline: 6.13 · Only an admin sees Invoices, and only their own workspace's documents
    Given "E2E Sofia" and "E2E Berlin" each hold invoices and credit notes
    When I sign in as <me> and open Settings, then Account
    Then I see <what>

    Examples:
      | me                                    | what                                                        |
      | a member of "E2E Sofia", not an admin | no Invoices section, no "Download" link, no document number |
      | the agency owner of "E2E Berlin"      | Berlin's invoices and credit notes, and none of Sofia's     |
      | the agency owner of "E2E Sofia"       | Sofia's invoices and credit notes, and none of Berlin's     |

  @edge
  Scenario: 6.14 · A download link opens my PDF for an hour, and a reload makes a fresh one
    Given I am the agency owner of "E2E Sofia", and Invoices says "Download links work for an hour."
    When I copy an invoice's "Download" link and open it in a private window where no one is signed in
    Then the PDF opens, the same one my invoice email carried
    When 61 minutes have passed and I open the copied link again
    Then it no longer opens the PDF
    But after I reload Settings, that row's "Download" opens it again

  @edge @write
  Scenario: 6.15 · A stored PDF that has gone missing reads "Unavailable", and the page still works
    Given I am the agency owner of "E2E Sofia", and the stored PDF of one of my documents has gone missing
    When I open Settings, then Account
    Then that row reads "Unavailable", while my other documents still offer "Download"
    And above them: "Download links could not be made just now. Reload the page to try again."
    When the missing PDF is put back and I reload the page
    Then "Download" is back on that row, and the caption is gone, and no email has arrived meanwhile

  @edge @clock @write
  Scenario: 6.16 · A paused workspace still lets me download every earlier invoice
    Given I am the agency owner of "E2E Varna", paused after 7 days without paying my declined renewal
    When I open the calendar
    Then I see the "Workspace paused" wall instead
    When I open Settings, then Account
    Then Invoices lists my earlier invoices, each with "Download", and every one of them opens
    And there is no row for the declined renewal

  @edge
  Scenario: 6.17 · An invoice Kontuur could not prepare at once reaches me within a day of the fix
    Given I am the agency owner of "E2E Sofia", and Kontuur cannot prepare invoice PDFs for a while
    When I add a client slot, and my card is charged pro rata
    Then no invoice email arrives, and the new "Invoice" row in Invoices reads "Preparing…"
    When Kontuur has fixed it, and a day has passed
    Then exactly one "Your invoice from Kontuur" email arrives, still dated the day I paid
    And the row now offers "Download"

  @core @edge
  Scenario Outline: 6.18 · A document whose email failed is in Invoices at once, and is emailed once later
    Given I am the agency owner of "E2E Sofia", and Kontuur cannot send email for a while
    When <event>
    Then no email arrives, but Invoices already shows the new "<kind>" row with "Download"
    When email works again, and a day has passed
    Then exactly one "<subject>" email arrives
    And its attachment is the same PDF that "Download" opened

    Examples:
      | event                                                | kind        | subject                       |
      | I add a client slot, and my card is charged pro rata | Invoice     | Your invoice from Kontuur     |
      | Kontuur refunds my newest pro-rata invoice in full   | Credit note | Your credit note from Kontuur |

  @edge
  Scenario: 6.19 · My documents are dated by Sofia's calendar, even when it is still yesterday where I am
    Given I am the agency owner of "E2E San Francisco", paying for 1 client
    And it is 00:10 in Sofia, while in San Francisco it is still the previous day
    When I add a client slot, and my card is charged pro rata
    Then the Invoices row, the email's "dated ‹date›" and the PDF's "Issued ‹date›" all show Sofia's new date
    And the text under the QR code reads …*‹Sofia's new date›*00:‹mm:ss›*‹total›, never 24:‹mm:ss›

  @edge
  Scenario: 6.20 · A VAT number I add later appears on my next invoice only
    Given I am the agency owner of "E2E Sofia", whose invoices so far show no VAT number of mine
    When I add the Bulgarian VAT number BG123456789 under "Manage billing", then add a client slot
    Then the new invoice's customer block shows "VAT: BG123456789" above my email
    And it still charges "Bulgarian VAT (20 %)"
    And my first invoice, downloaded again from Invoices, still has no "VAT:" line in its customer block

  @edge
  Scenario: 6.21 · I get one invoice when I pay again after failing my bank's 3-D Secure check
    Given I am the business owner of "E2E Bakery", a solo workspace on trial that has never paid
    When I pay at Checkout with a card that asks for my bank's check, and I fail the check
    Then Checkout says the payment could not be completed, and no invoice email arrives
    And Invoices still reads "No documents yet — the first payment creates one."
    When I pay again with the same card and pass the check
    Then Invoices lists one "Invoice" of "€34.80" with "Download", and one invoice email arrives

  @edge @clock
  Scenario: 6.22 · A charge after I deleted my workspace still brings an invoice, and a refund a credit note
    Given I cancelled and deleted my workspace "E2E Munich" while its renewal payment was still unpaid
    When that €34.80 renewal is charged to my card after all, and later Kontuur refunds it in full
    Then I get a "Your invoice from Kontuur" email for €34.80, then a "Your credit note from Kontuur" one
    And each has its PDF attached, and no "Open Plan & billing" button
    And the invoice email's note reads "Keep this email: the attached PDF is the original invoice."
    And the credit-note email's note reads "Keep this email: the attached PDF is the original credit note."

  @edge
  Scenario: 6.23 · A credit note stays in Invoices even if the refund to my card later fails
    Given I am the agency owner of "E2E Plovdiv", paying with a card whose refunds will fail
    When I add a client slot, and Kontuur then refunds that pro-rata invoice in full
    Then Invoices gains a "Credit note" row for the whole invoice, and one credit-note email arrives
    When the refund to my card later fails at my bank
    Then the "Credit note" row, its PDF and its email all stand, and no further email arrives

  @edge @clock @defect-D12
  Scenario: 6.24 · A declined renewal that Kontuur settles with me another way brings no invoice
    # fails today: a €29.00 invoice can appear whose Transaction is the declined card payment
    Given I am the agency owner of "E2E Berlin", and my renewal payment was declined
    When Kontuur marks that renewal as paid another way, such as by bank transfer, taking nothing from my card
    Then no invoice for that renewal appears in Invoices, and no invoice email arrives

  @edge
  Scenario: 6.25 · A payment Kontuur records only after midnight is dated the new day, taxed the day I paid
    Given I am the agency owner of "E2E Ruse", paying for 1 client, at 23:50 on the last day of a month
    When I add a client slot, and my card is charged pro rata
    Then Invoices shows no new row yet, and no invoice email arrives
    When Kontuur records my payment only after midnight
    Then the new "Invoice" row and the email's "dated ‹date›" both show the 1st of the new month
    And the PDF's "Issued" is the 1st, and its "Tax point" is the old month's last day

  @negative @clock
  Scenario: 6.26 · A renewal Kontuur has no billing email for stays "Preparing…" and is never mailed
    Given I am the agency owner of "E2E Zurich", and Kontuur no longer holds my billing email address
    When my plan renews
    Then my card is charged €29.00, and the new "Invoice" row in Invoices reads "Preparing…"
    And no invoice email arrives, and a day later the row still reads "Preparing…"

  @edge @clock @defect-D14
  Scenario: 6.27 · A half-price renewal's invoice adds up
    # fails today: the €17.40 PDF shows a €29.00 row under a "Net" of €14.50, and no discount row
    Given I am the agency owner of "E2E Burgas", paying for 1 client
    And Kontuur gave me half off my next month
    When my plan renews
    Then my card is charged €17.40, and one "Your invoice from Kontuur" email arrives for €17.40
    And its PDF's rows, the discount among them, add up to its "Net" €14.50
