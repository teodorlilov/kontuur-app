# Billing tests: customer journeys

Hand-run tests of Kontuur's billing on the Stripe sandbox, written as what a customer does and
sees. Each file follows one person (an agency owner, a teammate, a solo business owner or an
invitee) through pages, messages, bells, emails, invoice PDFs, Stripe's payment pages and what
their card is charged.

## Files

| File                                  | The journey                                  | Scenarios | `@core` |
| ------------------------------------- | -------------------------------------------- | --------: | ------: |
| `1-trying-kontuur.feature`            | the free trial, its end, and the pause       |        24 |       9 |
| `2-paying-for-kontuur.feature`        | choosing a plan and paying at Checkout       |        22 |       8 |
| `3-client-slots.feature`              | choosing how many clients I pay for          |        32 |      11 |
| `4-renewals-and-card-problems.feature` | monthly renewal and a failed payment        |        27 |       8 |
| `5-cancelling-and-deleting.feature`   | cancelling, coming back, deleting            |        25 |       8 |
| `6-invoices-and-refunds.feature`      | invoices, credit notes and refunds           |        27 |       8 |
| `7-allowance.feature`                 | drafts, images and rewrites each month       |        28 |       9 |
| `8-my-team.feature`                   | inviting and managing teammates              |        26 |       8 |
| `9-adding-my-website.feature`         | letting Kontuur read a client's website      |        18 |       6 |
|                                       |                                              |   **229** |  **75** |

## How to run them

- **Start with `@core`** (75 scenarios): the journeys that must work before launch.
- Run one file at a time, top to bottom. Scenarios in a file build on each other.
- Some states can't be reached just by using the app, such as "my trial ends in 2 days" or "my
  renewal payment is declined". The file of the same name in [`setup/`](setup/) says how to reach
  each one: a database edit on the test workspace, a step of the Stripe test clock, or a test card.
  It also lists which technical cases each scenario covers.
- **Tags**
  - `@positive`, `@negative`, `@edge`: what kind of case it is.
  - `@clock`: needs a paid workspace on the Stripe test clock.
  - `@write`: needs a database edit on the test workspace.
  - `@defect-Dn`: expected to fail today. The line under its title says what happens instead.

## Before you start

The Vercel environment variables, the Stripe sandbox (the €29 price must be tax-exclusive, and
subscriptions use flexible billing mode), the webhook's six events, the test clock and the test
accounts are listed once, in [technical/README.md](technical/README.md#before-you-start).

## Known defects

Verified against the code, **not fixed yet**. Each scenario describes what the customer should
get, so it fails until the defect is fixed.

| ID  | Severity | Scenario   | What happens today                                                           |
| --- | -------- | ---------- | ---------------------------------------------------------------------------- |
| D1  | high     | 5.23       | A Checkout left open before the delete can still be paid, and renews monthly |
| D5  | high     | 2.7        | Choose plan in two windows at once can give two payable Checkouts            |
| D14 | high     | 6.27       | A discounted invoice PDF shows the full-price row, so its lines don't add up |
| D15 | high     | 9.3, 9.18  | A private address is still fetched; one that never answers hangs for ~25 s   |
| D12 | high     | 6.24       | An invoice may name a declined charge as its transaction (depends on Stripe) |
| D11 | high     | 3.16, 4.11 | A declined slot raise may be charged once a card works (depends on Stripe)   |
| D2  | medium   | 2.9, 2.14  | The card shown after paying disappears after about 3 seconds                 |
| D4  | medium   | 2.22       | If the Stripe customer record was deleted, Choose plan fails every time      |
| D6  | medium   | 2.4        | A declined card at Checkout can leave the trial showing Paused               |
| D10 | medium   | 4.16       | A paused workspace tells a teammate to update the card, which they cannot do |
| D16 | medium   | 9.8, 9.9   | A failed re-analyse says "refreshed" and swaps the colours for the defaults  |
| D19 | low      | 8.26       | A solo workspace can take a teammate by an invite sent outside the Team tab  |

D3, D8 and D9 are gone: the client-slot model ([CLIENT-SLOTS.md](../CLIENT-SLOTS.md)) removed them.
D18 is fixed: a co-admin just removed is refused on their next click (8.22). D7 is fixed: Generate
posts refuses "Add your first client" in place (3.29). D10 keeps only its
teammate half: the Generate page at the limit now asks for the card, so 4.27 is no longer tagged.

D13 and D17 have nothing a customer can notice; they are in the technical suite.

## The technical suite

[`technical/`](technical/) holds the lower-level checks (293 scenarios): the database, Stripe's
records, the webhook and crons, and the monthly NRA audit file. Use it when a customer journey fails
and you need to find where.
