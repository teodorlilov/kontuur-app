Feature: Invoices and credit notes
  Every paid invoice and money-returning credit note becomes one numbered document, PDF stored, emailed once.
  What a document could not state honestly is refused, and the event row keeps the reason.

  # Run order: by ID; a merged row runs at its own ID. On a clock, "Tax point" is the clock date.

  Background:
    Given D-W1 Sofia with admin A1 and member M1, D-W2 Berlin and D-W3 US run on clock C1
    And D-W4 Munich, D-W5 Plovdiv and D-W6 Zurich run on clock C2
    And "the counter" is the last number in document_counters, series 'documents'
    And "the monthly query" is supabase/queries/undocumented-sales.sql

  @positive
  Scenario: D2 · The invoice email carries the PDF and the right words
    Given D-W1 paid its first Checkout with card 4242 as a Sofia consumer, as invoice No. N
    When I open the D-W1 payer inbox
    Then exactly one email arrives, subject "Your invoice from Kontuur"
    And it reads "Invoice No. ‹N› for €34.80, dated ‹D Month YYYY›, is attached as a PDF."
    And its Open Plan & billing button goes to ‹NEXT_PUBLIC_APP_URL›/settings?tab=account
    And it carries kontuur-‹N›.pdf, and Stripe sent no receipt email

  @positive @core
  Scenario: D3 · The invoice PDF carries every item Art. 52o asks for, domestic 20 %
    Given D-W1's first invoice PDF is open
    When I compare it with its Stripe invoice and charge
    Then the PDF shows:
      | part         | shows                                   |
      | header       | "Invoice" · "No. ‹N›", ten digits       |
      | dates        | "Issued ‹date›" · "Tax point ‹C1 date›" |
      | seller       | Chelling Ltd                            |
      | address      | 27 Gabar St, 1320 Bankya, Bulgaria      |
      | seller ids   | UIC 206770508 · VAT BG206770508         |
      | e-shop       | kontuur.app — ‹NRA_ESHOP_NUMBER›        |
      | customer     | name · street · 1000 Sofia, BG · email  |
      | customer ids | none: no "VAT:", no "Reg. no.:"         |
      | payment      | Order in_… · Transaction ch_…           |
      | POS          | Card, Stripe · ‹STRIPE_ACCOUNT_ID›      |
      | line         | period · group Б · Qty 1 · €29.00       |
      | totals       | €29.00 + VAT 20 % €5.80 = €34.80        |
      | footer       | "Document under Art. 52o …"             |
    When I scan the QR code with a phone
    Then it reads ‹NRA no.›*in_…*ch_…*YYYY-MM-DD*HH:MM:SS*34.80, in Sofia time

  @negative
  Scenario Outline: D6 · Each admin sees only their own workspace's documents, in the app and in the table
    Given D-W1 and D-W2 both hold documents
    When <viewer> opens Plan & billing
    Then the page lists <page>
    And as <viewer> in the SQL editor, sale_documents shows <rows seen>
    And sale_documents has one SELECT policy for admins, and authenticated cannot write to it
    # sql: select count(*), count(*) filter (where agency_id = :W1) from public.sale_documents;
    # sql: select policyname, cmd from pg_policies where tablename = 'sale_documents';
    # sql: select has_table_privilege('authenticated', 'public.sale_documents', 'INSERT');

    Examples:
      | viewer        | page                           | rows seen                    |
      | M1, W1 member | no Invoices section            | 0                            |
      | A2, W2 admin  | W2's own documents only        | W2's documents, none of W1's |
      | A1, W1 admin  | W1's invoices and credit notes | all of W1's documents        |

  @positive @core
  Scenario Outline: D8 · Each VAT customer type is invoiced on the right basis
    Given <ws> paid its first Checkout with card 4242, entering its own address and tax ID
    When I open its invoice email and PDF
    Then the email and the PDF both total <total>
    And the PDF's customer tax line is <tax line>
    And the PDF's VAT line is tax group <vat>
    And the document row shows <basis>

    Examples:
      | ID  | ws   | tax line                       | total  | vat               | basis              |
      | D8  | D-W2 | VAT: DE123456789               | €29.00 | А, reverse charge | reverse_charge     |
      | D11 | D-W3 | none                           | €29.00 | А, outside EU     | outside_eu, US     |
      | D24 | D-W4 | none                           | €34.80 | Б, 20 %, €5.80    | domestic 20.00, DE |
      | D48 | D-W6 | Reg. no.: CHE-123.456.789 MWST | €29.00 | А, outside EU     | outside_eu, ch_vat |

  @positive
  Scenario: D12 · A slot raise's pro-rata invoice PDF follows Stripe's lines exactly
    Given D-W1 is paying for 1 client slot
    When A1 raises Client slots to 2, clicks Change and confirms "Add slot"
    Then a second invoice email arrives with the next number and Stripe's total
    And the PDF has one row per Stripe line, in Stripe's order, each with its own period
    And Net, VAT and Total equal Stripe's subtotal, tax and total
    And the document row has one lines entry per Stripe line

  @edge
  Scenario: D13 · A document made just after midnight in Sofia takes Sofia's date
    Given D-W3 US is paying for 1 client slot, and it is 00:00–00:59 Sofia time, 21:xx UTC
    When A3 raises Client slots to 2, clicks Change and confirms "Add slot"
    Then the list, the email and the PDF's "Issued" all show the new Sofia date
    And the QR text reads …*‹new Sofia date›*00:MM:SS*‹total›, never 24:MM
    And the document's issued_at in UTC is the previous day, 21:xx

  @positive @clock
  Scenario: D14 · Each renewal gets its own document, numbered in order and dated by its payment
    Given D-W1, D-W2 and D-W3 are active on C1, and the counter reads L
    When C1 is advanced to 2 hours past D-W1's period end
    Then each gets one new Invoice row and email: D-W1 €69.60, D-W2 €29.00, D-W3 €58.00
    And each PDF's "Tax point" is C1's date, and its period is the new month
    And each invoice.paid answers 200 "period_paid", and no upcoming-renewal event is delivered
    And the new numbers are L+1…L+3, in payment order, with no gap
    # sql: select count(*) = max(number) - min(number) + 1 as gapless from public.sale_documents;

  @edge @clock
  Scenario: D15 · A renewal paid a day late names the successful charge, dated by the payment
    Given D-W1's default card is 4000 0000 0000 0341
    When C1 is advanced to 2 hours past D-W1's next period end
    Then D-W1 gets no new Invoice row or email
    When A1 makes 4242 the default card and C1 is advanced one more day
    Then exactly one €69.60 Invoice row and email arrive
    And the PDF's Transaction is the 4242 charge, and its "Tax point" the payment day

  @positive @core
  Scenario: D16 · A full refund through a credit note gives a credit-note document
    Given D-W1's first invoice N1 of €34.80 is listed, and the counter reads L
    When I credit all of N1 in Stripe, refunding €34.80 to the card
    Then credit_note.created answers 200 "credit_note"
    And the list gains "Credit note" · "€34.80", and one email carries kontuur-‹L+1›.pdf
    And the PDF shows "Credit note to invoice No. ‹N1› of ‹its date›", VAT 20 % €5.80, Total €34.80
    And its QR reads ‹NRA›*cn_…*re_…*‹date›*‹time›*34.80

  @negative
  Scenario: D17 · A replayed credit_note.created makes no second credit note
    Given D16's credit_note.created was handled, and the counter reads L
    When I click Resend on it in Workbench → Webhooks
    Then it answers 200 {"received":true,"duplicate":true}
    And the list still shows one "Credit note" row, and the counter still reads L
    And no second email arrives
    And Stripe offers nothing left to credit on the invoice

  @positive
  Scenario Outline: D18 · Each documentable credit note is issued against its invoice
    Given D-W1's <invoice> invoice can still be credited, and the counter reads L
    When I credit <credit> of it in Stripe, returned <return>
    Then credit_note.created answers 200 "credit_note"
    And a "Credit note" row of <total> and one credit-note email appear
    And the PDF shows "Credit note to invoice No. ‹<invoice>› of ‹its date›" and Transaction <tx>
    And the PDF shows <pdf>

    Examples:
      | ID  | invoice        | credit | return      | total  | tx             | pdf                   |
      | D18 | renewal        | all    | out of band | €69.60 | renewal's ch_… | Order cn_…            |
      | D20 | D12 slot-raise | €5.00  | by refund   | ~€6.00 | re_…           | Net €5.00, note's VAT |
      | D51 | D12 slot-raise | €0.01  | by refund   | €0.01  | re_…           | Net €0.01, VAT €0.00  |

  @negative @core
  Scenario Outline: D19 · A credit note the app cannot document is refused with a 500
    Given the <invoice> invoice is uncredited, and the counter reads L
    When I credit it in full in Stripe, returning <return>
    Then no "Credit note" row or email appears, and the counter still reads L
    And credit_note.created answers 500 {"error":"Event failed"}, a Resend too
    And the event row has no processed_at
    And its error reads "credit note cn_… <error>"

    Examples:
      | ID  | invoice     | return                          | error                           |
      | D19 | D15 renewal | €10.00 refund, rest out of band | …‹T − 1000› out of band; …      |
      | D23 | D22 one-off | €10.00 refund to the card       | …in_…, which has no document    |
      | D25 | D-W4 first  | €34.80 to the customer balance  | credits the customer's balance… |

  @negative
  Scenario: D21 · A bare refund on the payment leaves no document
    Given D-W2's first €29.00 payment is not refunded
    When I refund it in full from Stripe → Payments, declining a credit note
    Then D-W2's list shows nothing new, and no email arrives
    And Stripe sends no credit_note.created, and charge.refunded is not sent to kontuur.app
    And the monthly query does not list the refund

  @negative @core
  Scenario Outline: D22 · A paid invoice the app did not make: a 200, no document, an error log
    Given the counter reads L
    When I <how> in Stripe
    Then no document or email appears, and the counter still reads L
    And invoice.paid answers 200 "undocumented_sale"
    And an error-level log reads "…invoice in_… took ‹amount› cents and has no document"
    And the monthly query lists the invoice, and <also>

    Examples:
      | ID  | how                                   | also                                 |
      | D22 | charge D-W2 a €10.00 one-off invoice  | Stripe shows it paid                 |
      | D43 | subscribe a new customer, no metadata | created and deleted answer "ignored" |

  @negative @clock
  Scenario Outline: D27 · A renewal carrying a debt, or paid with no card, is refused with a 500
    Given <before>, and the counter reads L
    When C2 is advanced past D-W4's next period end, and <then>
    Then D-W4 gets no new row or email, and the counter still reads L
    And invoice.paid answers 500 {"error":"Event failed"} on every retry
    And the event's error reads "invoice in_… <error>"
    And the monthly query lists it

    Examples:
      | ID  | before                  | then                   | error                                  |
      | D27 | a €5.00 balance debit   | €39.80 is charged      | carries a debt from an earlier invoice |
      | D30 | no card on the customer | it is paid out of band | was paid with no card charge; …        |

  @edge @clock
  Scenario: D28 · A €0 renewal is no sale: a 200, no document, nothing for the monthly check
    Given D-W4's balance is €0.00, and a 100 %-off once-only coupon is on its subscription
    When C2 is advanced to 2 hours past D-W4's next period end
    Then no row or email appears, and "Renews on" moves to the new period
    And Stripe shows a €0.00 renewal paid with no charge
    And invoice.paid answers 200 "period_paid"
    And the counter is unchanged, and the monthly query does not list it

  @edge @clock
  Scenario: D29 · A pre-payment credit note issues nothing, and the invoice it reduced is refused when paid
    Given D-W4's coupon is used up, and 0341 is its default card
    When C2 passes the next period end, and I credit €5.00 of the failed open renewal
    Then credit_note.created answers 200 "ignored", with no document or email
    When A4 makes 4242 the default card and I charge the rest of the open invoice
    Then invoice.paid answers 500 with "…was reduced by a pre-payment credit note…"
    And no Invoice row appears, and the monthly query lists the sale

  @edge @clock
  Scenario: D31 · A payment and its refund after the workspace was deleted are documented with no owner
    Given D-W4 has no card, its renewal is open, and A4 cancelled and deleted the workspace
    When I add card 4242 in Stripe and charge the open invoice
    Then invoice.paid answers 200 "no_workspace", and one €34.80 email arrives with no button
    And the document has no workspace, its PDF at unassigned/‹N›.pdf
    When I credit that invoice in full in Stripe, refunding €34.80
    Then one credit-note email arrives with no button, its PDF at unassigned/‹M›.pdf

  @edge
  Scenario: D42 · After a failed 3-D Secure check, the paid first invoice names the succeeded charge
    Given D-W5 Plovdiv is on trial with no documents
    When A5 pays with 4000 0025 0000 3155 and clicks Fail in Stripe's test authentication
    Then Checkout says the payment could not be completed, and no row or email appears
    When A5 pays again with the same card and clicks Complete
    Then the list shows one "Invoice" · "€34.80" · Download
    And the PDF's Transaction is the succeeded charge, and D-W5 has one document

  @edge
  Scenario: D44 · A VAT number added later appears on the next document only
    Given D-W1 pays with 4242, and A1 added tax ID BG123456789 in Stripe's portal
    When A1 raises Client slots by one, clicks Change and confirms "Add slot"
    Then the new PDF's customer block ends "VAT: BG123456789", with "Bulgarian VAT (20 %)"
    And D-W1's first PDF, downloaded again, still has no "VAT:" line
    And the new document's taxIds is [eu_vat BG123456789]; earlier ones keep []

  @edge @clock @defect-D12
  Scenario: D45 · A renewal paid out of band after a failed card: which charge its document names
    Given A2 made 0341 D-W2's default card, and the counter reads L
    When C1 is advanced past D-W2's next period end, and its renewal attempt fails
    And I mark D-W2's open renewal invoice paid outside of Stripe
    Then Stripe shows it paid out of band with no money taken, and exactly one of these holds:
      | cents_paid                  | invoice.paid      | D-W2 sees                            |
      | total; failed charge latest | 200 "period_paid" | €29.00 row naming the 0341 charge    |
      | 0                           | 200 "period_paid" | no row; monthly query misses it      |
      | —                           | 500               | no row; "…paid with no card charge…" |
    And only the 500 row passes; the other two are defects
    # sql: select error, (payload->'data'->'object'->>'amount_paid')::int as cents_paid
    # sql:   from public.billing_events where type = 'invoice.paid' and object_id = :invoice_id;

  @edge
  Scenario: D49 · A credit note whose email fails is stored, downloadable, and mailed once by the cron
    Given D-W3's slot-raise invoice Nu from D13 is uncredited, and RESEND_FROM_EMAIL is deleted
    When I credit Nu in full in Stripe with a refund to the card
    Then credit_note.created answers 200 "credit_note", and no email arrives
    And a minute later the "Credit note" row shows Download, its PDF citing invoice No. ‹Nu› and its date
    When RESEND_FROM_EMAIL is back, the note is over 10 minutes old, and the billing cron runs
    Then exactly one "Your credit note from Kontuur" email arrives, and the row is delivered

  @edge
  Scenario: D50 · Two part credit notes on one invoice give two documents, never more than the invoice
    Given D-W2's €29.00 reverse-charge renewal Nw from D14 is uncredited, and the counter reads L
    When I create a €10.00 then a €19.00 credit note on Nw, each refunded to the card
    Then both answer 200 "credit_note", with two emails and rows of €10.00 and €19.00
    And each PDF shows "Credit note to invoice No. ‹Nw› of ‹its date›", reverse charge €0.00, its own re_…
    When I try a third €1.00 credit note on Nw
    Then Stripe offers nothing left to credit, and the counter moved by exactly 2

  @edge
  Scenario: D54 · A refund that fails after its credit note was documented leaves the document standing
    Given D-W5 is active on C2 with 4000 0000 0000 5126 as its default card, and the counter reads L
    When A5 raises Client slots by one, and I credit its pro-rata invoice in full with a refund to the card
    Then credit_note.created answers 200 "credit_note", and D-W5 gets a "Credit note" row and one email
    When Stripe later shows the refund as Failed
    Then the row, the PDF and the email stand, and no new email or billing event arrives
    And the credit note keeps the failed re_…, delivered, with gross equal to the invoice's
