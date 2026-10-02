Feature: Setup and the trial
  Sandbox wiring, then a trial from sign-up through its caps, reminders, grace and pause.

  # Run order: T21 to T24 on one UTC day.

  Background:
    Given agency A1 with admin A1 and member M1; S1 solo and set up; S2 solo, not set up
    And a SQL write runs on the test workspace only, then two reloads a minute later
    And the six events: subscription created/updated/deleted, invoice paid/failed, credit note

  @positive @core
  Scenario: T1 · The crons and the webhook are wired to the sandbox, and the cron needs the secret
    When the billing and publish crons are called with the secret
    Then billing answers 200 with reservationsCleared, reminders and documents, none null
    And publish answers 200 with processed, published, failed, pending, unreconciled, writeErrors
    And Stripe's endpoint is Enabled, API 2026-08-26.dahlia, six events, no invoice.upcoming, deliveries 200
    When the billing cron is called with no secret, then a wrong one
    Then both answer 401 "Unauthorized"

  @edge @core
  Scenario: T3 · The database is in its post-migration shape
    When the read-only check below runs in the Supabase SQL editor
    Then agencies.trial_ends_at has no default, and agencies.plan holds only trial or house
    And no unpaid workspace lacks a trial end, and notifications has the (agency_id, dedup_key) index
    # sql: select (select column_default from information_schema.columns where table_schema='public'
    # sql:   and table_name='agencies' and column_name='trial_ends_at'),
    # sql:   (select string_agg(distinct plan, ',') from agencies),
    # sql:   (select count(*) from agencies where trial_ends_at is null
    # sql:     and stripe_subscription_id is null and plan <> 'house'),
    # sql:   (select count(*) from pg_indexes where tablename='notifications'
    # sql:     and indexdef ilike '%(agency_id, dedup_key)%');  -- null · trial,house · 0 · 1

  @positive @core
  Scenario: T4 · An agency sign-up starts a 14-day trial with the trial's allowance
    When A1 signs up as "E2E Agency" as "I manage social media for clients" and confirms
    Then the sign-up dialog said "14-day trial · no card required"
    And Plan & billing shows Trial, ends ‹sign-up + 14 days›, 0 of 3 clients
    And the meters read 0 of 12 drafts, 0 of 50 images, 0 of 5 rewrites
    And the header reads "E2E Agency · 1 member · Trial plan"
    And Stripe has no customer for A1

  @positive
  Scenario: T6 · A solo sign-up sets up its one business on the trial
    When S1 signs up as "E2E Solo" as "I manage my own business socials" and confirms
    Then it lands on /clients/new
    When S1 fills the setup form from a real website and saves
    Then the toast reads "Profile saved"
    And the header reads "E2E Solo · Solo workspace · Trial plan"
    And Plan & billing shows "1 of 1" in red and "€29.00 a month excl. VAT for your business"

  @edge
  Scenario Outline: T7 · A solo trial with no business can open no dashboard page, Settings included
    Given S2 never saved the setup form
    When S2 opens kontuur.app<address>
    Then it lands on /clients/new

    Examples:
      | address               |
      | /settings?tab=account |
      | /dashboard            |
      | /calendar             |
      | /generate             |

  @positive @core
  Scenario: T10 · The admin adds clients up to the trial's three, with nothing sent to Stripe
    Given A1 is on its trial with no client
    When A1 adds "Client One", "Client Two" and "Client Three" from real websites
    Then each save shows "Client saved"
    And Plan & billing's Clients ends at "3 of 3" in red with a full bar
    And "Clients to pay for" reads 3, beside "3 clients × €29.00 = €87.00 a month excl. VAT"
    And Stripe receives nothing

  @negative @core
  Scenario Outline: T11 · A client past the trial cap is refused on every way in
    3-client message: "Trial includes 3 clients. Choose a plan to add more."
    Business message: "Your plan covers one business."

    Given A1 has 3 clients and S1 its one business, both on the trial
    When <who> uses <way in>
    Then <observed>
    And the client count is unchanged

    Examples:
      | who | way in                  | observed                        |
      | A1  | dashboard Add client    | disabled, 3-client message      |
      | A1  | Clients page Add client | the same                        |
      | A1  | Cmd+K "Add client"      | dimmed; nothing navigates       |
      | A1  | /clients/new, saved     | 3-client toast; form stays      |
      | S1  | sidebar My business     | own edit page, no Add client    |
      | S1  | /clients                | forwards to own settings        |
      | S1  | Cmd+K "Add"             | "Nothing matches “Add”."        |
      | S1  | /clients/new, saved     | business message as a toast     |

  @edge
  Scenario: T13 · Deleting a client at the trial cap frees room; the dialog says nothing of the bill
    Given A1 has 3 clients on its trial
    When A1 deletes Client Three from its edit page
    Then the dialog ends "…This cannot be undone." with no line about the bill
    And Plan & billing reads Clients "2 of 3" and "2 clients × €29.00 = €58.00 a month excl. VAT"
    When A1 adds Client Three back
    Then Clients reads "3 of 3" again

  @negative
  Scenario Outline: T40 · Only an agency admin gets a Delete client button
    Given A1 has clients on its trial, and S1 has its business
    When <who> opens <page>
    Then <observed>

    Examples:
      | who | page                        | observed                          |
      | A1  | Client One edit, Basic info | Danger zone ends in Delete client |
      | S1  | My business, Basic info     | no Danger zone, no Delete client  |
      | S1  | Cmd+K "Delete"              | "Nothing matches “Delete”."       |

  @negative @write
  Scenario: T18 · More than three days before the trial ends there is no banner and no reminder
    Given (SQL write) A1's trial ends in 3 days 2 hours
    When the billing cron runs and the dashboard is reloaded
    Then there is no banner and no bell
    And Plan & billing's Trial ends shows the new date
    And A1 has no trial_ending row

  @positive @core @write
  Scenario: T19 · In the trial's last three days: an amber banner, one bell each, one email, once
    Given (SQL write) A1's trial ends in 2 days 23 hours
    When the billing cron runs
    Then A1 and M1 see the amber banner "Your trial ends on ‹date› — choose a plan to keep generating."
    And A1 and M1 each get the bell "Your trial ends soon"
    And only A1 gets the email "Your Kontuur trial ends soon"
    And two more cron runs send no second bell or email

  @edge @write
  Scenario: T21 · A new trial end re-arms the reminder once; a new timezone re-sends nothing
    Given (SQL write) A1's trial now ends tomorrow at 22:30 UTC
    When the billing cron runs
    Then a second "Your trial ends soon" bell and email arrive
    When A1 sets the timezone to Europe/Sofia and the billing cron runs again
    Then the banner names the day after tomorrow, and nothing is sent
    And a move to tomorrow 23:00 UTC by SQL write, then a cron run, sends nothing

  @edge @write
  Scenario: T23 · A workspace with no admin still gets its bell, and the missing email is reported
    Given (SQL write) A1's user is a member and its trial ends today at 23:59 UTC
    When the billing cron runs
    Then reminders.errors holds {"agencyId":"‹A1 id›","error":"no admin to email"}
    And a new "Your trial ends soon" bell appears, and nobody gets an email
    When (SQL write) A1 is admin again
    Then A1 has 3 trial_ending rows and exactly 1 admin

  @positive @core @write
  Scenario: T24 · The trial has ended: a red banner, the grace date, one bell and one email
    Given (SQL write) A1's trial ended 1 day ago
    When the billing cron runs
    Then every dashboard page shows the red banner "Your trial ended on ‹yesterday›. …"
    And Plan & billing shows red "Trial ended" and "Workspace pauses on ‹yesterday + 7›"
    And A1 gets the bell "Your trial has ended" and the email "Your Kontuur trial has ended"
    And a second cron run sends no second bell or email

  @negative @write
  Scenario Outline: T25 · In the grace nothing new is made, and each refusal gives the reason
    Given A1's trial ended yesterday
    When <action>
    Then <observed>
    And no usage is added and no generation run starts

    Examples:
      | action                              | observed                                         |
      | A1 presses dashboard Generate posts | disabled with the grace sentence                 |
      | A1 presses dashboard Add client     | "Choose a plan to add clients."                  |
      | A1 opens /generate                  | it opens, the grace sentence in its form's place |
      | A1 opens /clients/new               | lands on /settings?tab=account                   |
      | A1 presses Rewrite on a draft       | grace toast; a 402 {"error": that sentence}      |
      | SQL: Client Two due; generate cron  | Client Two in skipped_unentitled                 |

  @positive
  Scenario: T27 · In the grace, drafts waiting on /generate can be approved, and a scheduled post goes out
    Given A1's trial ended; Client One has your Instagram, and drafts P1, P2 and P3 wait on /generate
    When A1 opens them there and approves P1 for 10 minutes from now, P2 and P3 for tomorrow, to Instagram
    Then all three are accepted
    When P1's time has passed and the publish cron runs
    Then P1 is published on Instagram and shows as published in the calendar
    And P2 and P3 are still scheduled

  @edge @write
  Scenario Outline: T28 · The trial turns into its grace, and the grace into the pause, with no cron
    Given (SQL write) A1's trial ends at <trial end>
    When Plan & billing is reloaded at once, and again 4 minutes later
    Then it first shows <at once>, then <after 4 minutes>
    And the row still reads plan trial with no subscription status

    Examples:
      | trial end                | at once                     | after 4 minutes                    |
      | now + 3 minutes          | amber "Trial", ends today   | red "Trial ended", pauses today+7  |
      | now − 7 days + 3 minutes | "Trial ended", pauses today | red "Paused", Choose plan          |

  @positive @core @write
  Scenario: T30 · Paused: a wall over every dashboard page but Settings, one bell and one email
    Given (SQL write) A1's trial ended 8 days ago
    When A1 opens Dashboard, Clients, Review queue, Calendar, Comments, Client ideas and Analytics
    Then each shows only the "Workspace paused" wall with one Choose a plan button
    And Choose a plan lands on /settings?tab=account, which shows "Paused"
    When the billing cron runs
    Then A1 gets the bell "Your workspace is paused" and the email "Your Kontuur workspace is paused"

  @negative @write
  Scenario: T31 · Paused refuses every way in, for admin and member alike, and a due post waits
    Given A1 is paused, with P2 and P3 still scheduled
    When A1 opens /generate, /clients/new, /review, /calendar and a client's edit page
    Then the first two land on /settings?tab=account, the other three show the wall
    And M1 sees the same wall and the "Your workspace is paused" bell, but no email
    When (SQL write) P2 is due an hour ago, P3 two days ago, and the publish cron runs twice
    Then both stay scheduled with 0 attempts and no error

  @edge @write
  Scenario: T33 · A solo trial with no business gets in after the trial, is told why, then pauses
    Given (SQL write) S2's trial ended yesterday, still with no business
    When S2 opens /dashboard
    Then it shows the red "Your trial ended on …" banner, and Create content is disabled
    And Plan & billing shows "Workspace pauses on ‹yesterday + 7›" and "0 businesses"
    When (SQL write) S2's trial ended 8 days ago
    Then the dashboard shows the "Workspace paused" wall

  @edge @write
  Scenario Outline: T34 · The paused reminder is sent within a week of the pause, never after
    Given A1 is paused, with its workspace_paused row from T30
    And (SQL write) its trial ended <ended> ago
    When the billing cron runs
    Then <result>

    Examples:
      | ended            | result                                    |
      | 14 days − 1 hour | a second bell and email, Sofia pause date |
      | 14 days + 1 hour | no bell, no email                         |

  @edge @write
  Scenario: T35 · A house workspace is never paused, never reminded and never offered a plan
    Given (SQL write) A1 is plan house, trial ended 9 days ago, P2 and P3 moved 30 days out
    When A1 opens the dashboard and Plan & billing, and the billing cron runs
    Then there is no wall, banner or Choose plan, and Plan & billing shows green "Active"
    And the cron checks A1 but sends nothing
    When (SQL write) A1 is set back to plan trial
    Then the wall is back

  @edge @write
  Scenario: T36 · An unpaid workspace with no trial end is paused at once and never reminded
    Given (SQL write) A1's trial_ends_at is null
    When A1 opens Plan & billing and the dashboard, and the billing cron runs
    Then Plan & billing shows "Paused" with no date row, and the dashboard shows the wall
    And the cron neither checks nor counts A1, and no bell arrives

  @edge @write
  Scenario: T38 · Paying after the pause: a post due in the last day goes out, an older one fails
    Given A1 is paused, and (SQL write) P2 is due an hour ago and P3 two days ago
    When A1 pays Choose plan with 4242 4242 4242 4242 and a Bulgarian address
    Then after "You’re on Pro" and a minute, the wall and banner are gone
    When the publish cron runs, and again 5 minutes later
    Then P2 is published on Instagram, and P3 shows as failed "Missed publish window"

  @negative @defect-D6
  Scenario: T45 · A declined card at Checkout leaves the trial untouched, and Choose plan still works
    Given S1 is on its trial with a Stripe customer and no subscription
    When S1 pays at Checkout with 4000 0000 0000 9995 twice, then takes the back link
    Then the toast reads "Checkout was cancelled — nothing was charged."
    And a minute later Plan & billing still shows Trial, the same end date and Choose plan
    When S1 presses Choose plan again
    Then Stripe's page opens, not "Your plan is being activated…"
