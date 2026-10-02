Feature: The NRA audit file, delivery retries and the invoices list
  Each month's documents become one NRA audit file.
  A document that failed to print or mail is retried by the billing cron.

  # Run order: by ID. SQL and Storage writes on the test workspace only.

  @edge
  Scenario: N2 · A paused workspace's admin still downloads every earlier invoice
    Given a workspace paused after a failed renewal and an expired grace
    When its admin opens Plan & billing
    Then the page is not walled
    And every earlier invoice row downloads
    And there is no row for the open failed renewal

  @negative
  Scenario Outline: N4 · A download link opens only its own PDF, only with its token, for an hour
    Given a paid workspace's Invoices reading "Download links work for an hour."
    And a copied Download link and a second workspace's stored PDF path
    When I open <link> in a private window
    Then <result>

    Examples:
      | link                                | result                   |
      | the link as copied                  | its PDF opens            |
      | the link without its ?token=…       | Supabase Storage's error |
      | one token character changed         | Supabase Storage's error |
      | /object/public/, no token           | Supabase Storage's error |
      | the second workspace's path         | Supabase Storage's error |
      | the copied link, 61 minutes later   | Supabase Storage's error |
      | a fresh link after a reload         | its PDF opens again      |

  @edge @write
  Scenario: N5 · A missing stored PDF reads "Unavailable", the page loads, nothing re-prints it
    Given a delivered document whose PDF is saved locally and deleted from the bucket
    When I reload Plan & billing twice
    Then the row reads "Unavailable" under "Download links could not be made just now. …"
    And other rows still show Download, and no email is sent
    When I upload the saved PDF back under the same name and reload
    Then Download is back, and the caption is gone

  @negative
  Scenario Outline: N7 · The audit file refuses any caller without the exact secret
    When I download the 2026-09 audit file with <authorization>
    Then it answers 401 {"error":"Unauthorized"}, with no log line

    Examples:
      | authorization                     |
      | no header                         |
      | Bearer wrong                      |
      | bearer $CRON_SECRET, lower-case b |
      | Bearer, two spaces, $CRON_SECRET  |
      | a browser signed in as the admin  |

  @negative
  Scenario: N9 · Without the NRA shop number a payment goes undelivered and the audit file answers 500
    Given NRA_ESHOP_NUMBER is noted, deleted in Vercel and redeployed
    When a test workspace pays a new Checkout
    Then the payment succeeds, the row reads "Preparing…", and no email arrives
    And delivery_error reads "NRA_ESHOP_NUMBER is not set"
    When I download the 2026-09 file and the empty 2025-01 file
    Then both answer 500 "The audit file could not be built."

  @edge
  Scenario: N11 · The retry waits 10 minutes, keeps failing while broken, and delivers once fixed
    Given NRA_ESHOP_NUMBER is still deleted and N9's document is under 10 minutes old
    When the billing cron runs before and again after the document is 10 minutes old
    Then both answer 200, and the first leaves the document out of "retried"
    And the second counts it retried, not delivered, and no email arrives
    When I restore NRA_ESHOP_NUMBER, redeploy and run the billing cron twice
    Then the first run delivers it with one email, and the second sends none

  @edge
  Scenario Outline: N13 · A failed email is retried with the stored PDF, never re-printed, mailed once
    Given RESEND_API_KEY is noted, deleted in Vercel and redeployed, clear of 08:00 UTC
    When a test workspace makes a payment
    Then no email arrives, and delivery_error reads "RESEND_API_KEY is not set"
    When I save its PDF as stored.pdf, restore the key, wait 10 minutes and <run>
    Then exactly one "Your invoice from Kontuur" arrives, its PDF matching stored.pdf by sha256
    And delivered_at is set, and <error>

    Examples:
      | run                            | error                                      |
      | run the billing cron once      | delivery_error is null                     |
      | fire two billing crons at once | delivery_error is null or Resend's refusal |

  @negative @clock
  Scenario: N14 · A document with no payer email fails every day, before any PDF, blocking no others
    Given a paid test-clock workspace whose Stripe customer's email is cleared
    When I advance its clock two hours past the next renewal, and the renewal is paid
    Then the renewal's row reads "Preparing…", with no email
    When the billing cron runs after 10 minutes, and again the next day
    Then each run logs "… the document carries no customer email" and delivers other documents
    And the document has no storage_path, and that sentence as delivery_error

  @negative
  Scenario Outline: N16 · A malformed month is refused before anything is read
    When I download the audit file with <query>
    Then it answers 400 {"error":"month must be YYYY-MM"}, with no [billing:audit-file] log line

    Examples:
      | query           |
      | month=2026-13   |
      | month=2026-9    |
      | month=October   |
      | month=09-2026   |
      | no month at all |

  @edge @core
  Scenario Outline: N17 · A past or future month with no document answers 204
    Given NRA_ESHOP_NUMBER and STRIPE_ACCOUNT_ID are set
    And no document was issued in <month>, Sofia time
    When I download the <month> file
    Then it answers 204, and the output file is empty or absent

    Examples:
      | month   |
      | 2025-01 |
      | 2027-01 |

  @positive @core
  Scenario: N18 · This month's audit file lists every invoice of the month and validates
    Given several invoices issued this month, some whose email failed first, and no refund
    When I download the 2026-09 file
    Then it answers 200, and xmllint prints "audit-2026-09.xml validates"
    And the header has eik 206770508, e_shop_n = NRA_ESHOP_NUMBER, mon 09, god 2026
    And there is one order per invoice this month, in number order, delivered or not
    And each order's amounts match Stripe in euro, e.g. 29.00, VAT 5.80, total 34.80

  @edge
  Scenario Outline: N19 · Each VAT customer type is filed at the rate its document stored
    Given a paid Checkout this month, 1 client, card 4242, for <customer>
    When I download this month's file and find its order
    Then the file validates, and the order has art_vat_rate <rate>, ord_vat <vat>, ord_total2 <total>
    And the document has vat_basis <basis>
    And the file carries no customer name, address or VAT ID

    Examples:
      | customer                     | rate | vat  | total | basis          |
      | Bulgarian address, no VAT ID | 20   | 5.80 | 34.80 | domestic       |
      | EU business, valid VAT ID    | 0    | 0.00 | 29.00 | reverse_charge |
      | address outside the EU       | 0    | 0.00 | 29.00 | outside_eu     |

  @edge
  Scenario: N20 · An order with several lines sums exactly
    Given a document made by a mid-period slot raise whose confirm said "is charged today"
    When I find its order in this month's file
    Then it has one artenum per document line, in order
    And art_name is Stripe's description with × as x, € as EUR and № as No
    And Σ art_vat = ord_vat and Σ art_sum = ord_total2, to the cent
    And the unused-time credit is a negative article, and the file validates

  @edge @clock
  Scenario: N21 · A test-clock renewal is dated by its payment but filed by its issue
    Given a test-clock workspace that paid its first Checkout in September
    When I advance its clock two hours past its October renewal, and the renewal is paid
    Then its Invoices row and email are dated today
    And the September file holds its order, with ord_d in October and doc_date today
    And the October file answers 204

  @edge @core
  Scenario: N22 · A month with refunds and no sale answers 409 with the accountant's question
    Given the 1st of a new month, before any payment in the sandbox
    When I credit N13's September invoice in full in Stripe, refunded to the card
    Then a "Credit note" row and its email appear, dated today in Sofia
    When I download the October file
    Then it answers 409 "2026-10 holds credit notes but no sale, …"
    And the message ends "Ask the accountant how to report the refunds alone."

  @edge
  Scenario: N23 · A payment just after Sofia midnight on the 1st belongs to the new month
    Given N22's October file answered 409, before 02:45 Sofia on 1 October
    And a paid workspace with no test clock
    When its admin makes a payment
    Then the row and the email are dated "1 October 2026"
    And the October file answers 200, with ord_d and doc_date both 2026-10-01
    And the September file does not hold its order

  @edge
  Scenario: N24 · Credit notes are filed as returned orders in their own month
    Given N22's credit note and at least one sale in the same month
    When I download that month's file
    Then it answers 200 and validates, with that month's invoices as its only orders
    And r_ord is 1, with one rorderenum for N13's in_…, the note's total and date, r_paym 2
    When I credit another invoice fully with two refunded notes
    Then the file has three rorderenum, r_ord 2, and r_total the three notes' sum

  @negative
  Scenario: N26 · A fractional VAT rate makes the month answer 409, never a rounded line
    Given every other audit check of this month is done, and a Finland OSS registration in Stripe
    When a new test workspace pays Checkout with a Finnish address
    Then the document has vat_basis oss and vat_rate 25.50
    When I remove that registration and download this month's file
    Then it answers 409 "Document ‹number› carries VAT at 25.5 %, …"
    And the month answers 409 from now on

  @negative
  Scenario Outline: N27 · A hand-made Stripe invoice gets no document; only one that took money is flagged
    Given a test Stripe customer with a saved 4242 card
    When I create, finalize and pay a one-time invoice of <amount> in the Stripe Dashboard
    Then invoice.paid answers 200 "<outcome>", logged at <level> level
    And there is no Invoices row, email, document, or audit order
    And the monthly query <query>

    Examples:
      | amount                   | outcome           | level | query                           |
      | €10.00                   | undocumented_sale | error | lists it: cents paid, no agency |
      | €0.00                    | ignored           | info  | does not list it                |
      | €0.30, amount paid €0.00 | ignored           | info  | does not list it                |

  @edge
  Scenario: N30 · A deleted workspace's documents stay in the audit file
    Given a paid test workspace whose document numbers I note
    When I delete the workspace from the app
    Then its documents keep their numbers and amounts, with no agency
    And that month's audit file still lists their orders unchanged, and validates

  @edge @clock @defect-D13
  Scenario: N40 · A renewal paid wholly from a customer credit is refused, and the monthly query misses it
    Given a test-clock workspace whose Stripe customer has a €40.00 credit
    When I advance its clock past the next renewal, and it is paid with €0.00 from the card
    Then invoice.paid answers 500 {"error":"Event failed"} on every attempt, with no row or email
    And the log says "… was paid in part from a customer credit (starting_balance -4000)"
    And the monthly query does not list it, but the failed-events query does
    And Stripe leaves a €5.20 credit on the customer
    # sql: select type, object_id, error from public.billing_events where error is not null;

  @edge @write
  Scenario: N44 · A "delivered" stamp lost within 24 hours is re-sent and mails nothing twice
    Given a test document delivered under 24 hours ago and issued over 10 minutes ago
    And its delivered_at is cleared by SQL
    When the billing cron runs
    Then it counts the document retried and delivered
    And no new email arrives, in the mailbox or in Resend
    And delivered_at is set again, and the stored PDF's time has not moved

  @negative @write
  Scenario: N45 · A stored PDF gone before the retry fails the retry and delivers once put back
    Given a test document delivered over 24 hours ago, its PDF saved as kept.pdf
    And its delivered_at is cleared by SQL and its PDF deleted from Storage
    When the billing cron runs
    Then delivery_error starts "document download failed:", and no new PDF is in the bucket
    When I upload kept.pdf back under the same name and the billing cron runs
    Then one invoice email arrives, its PDF with the same sha256 as kept.pdf

  @edge
  Scenario: N46 · A chargeback credit note, out of band, is filed as a returned order
    Given D18's out-of-band credit note this month, and at least one invoice this month
    When I download this month's file
    Then it answers 200 and validates
    And one rorderenum names the note's invoice, total, date and r_paym 2
    And r_total includes it

  @edge
  Scenario: N47 · A payment late on a month's last evening, documented after midnight, files in the new month
    Given a paid no-clock workspace renewing over a day later, at 23:45 Sofia on a month's last day
    When I disable its webhook endpoint, and at 23:50 the admin adds a slot that "is charged today"
    And I re-enable the endpoint after 00:05 and resend invoice.paid
    Then it answers 200 "written", and the row and email are dated the 1st of the new month
    And the new month's file has ord_d the old month's last day and doc_date the 1st
    And the old month's file lacks it

  @negative @clock @defect-D14
  Scenario: N48 · A half-off coupon gives a document whose lines do not add up; the file answers 500
    Given a test-clock workspace with a 50 %-off once-only coupon, all other month checks done
    When I advance its clock two hours past the next renewal, and it is paid
    Then the "€17.40" PDF shows a €29.00 line, Net €14.50, VAT €2.90, and no discount row
    When I download this month's file
    Then it answers 500 "The audit file could not be built."
    And the log reads "document ‹number›: lines total 3190 but the document says 1740"
