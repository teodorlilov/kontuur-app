Feature: The allowance, meters and bells
  What runs, pictures and rewrites cost, when a pool refuses, and which bell rings, once.
  Trial: 12 drafts, 50 images, 5 rewrites. Pro per slot paid this period: 25, 105, 15 (2 slots: 50, 210, 30).

  # Run order: as listed; set STRIPE_TEST_CLOCK and redeploy before A30.

  Background:
    Given A-test is an agency trial with clients S on Single image and C on Carousel, 6 slides
    And A-house is a workspace with one client H
    And a period is 'trial', "paid" = the paid period's start 'YYYY-MM-DD', or the house UTC month
    And "SQL: <period> <kind> at N" sets that usage_counters row to count N, pending 0, test workspace only
    # sql: insert into usage_counters (agency_id, period, kind, count, pending)
    # sql:   values (:agency_id, :period, :kind, N, 0) on conflict (agency_id, period, kind)
    # sql:   do update set count = excluded.count, pending = 0;

  @positive
  Scenario: A1 · A new trial's wizard prices whole posts from the allowance
    Given A-test just signed up, with nothing generated
    When I open /generate for S and press "One post more" until it stops, in each format
    Then the caption and stepper read:
      | format              | caption                   | stepper stops at |
      | Single image        | 12 posts left this period | 7                |
      | Carousel, 6 slides  | 8 posts left this period  |                  |
      | Carousel, 10 slides | 5 posts left this period  | 5                |
      | Carousel, 3 slides  | 12 posts left this period |                  |
    And nothing is reserved by looking

  @positive @core
  Scenario: A3 · A run puts on the meter exactly the drafts and pictures that landed
    Given A-test's untouched trial
    When I generate 2 Single image posts for S and wait for both pictures
    Then the panel reads "Nothing publishes from here. You review every draft first."
    And Plan & billing reads AI drafts "2 of 12", AI images "2 of 50", Rewrites "0 of 5"
    And /generate for C on Single image reads "10 posts left this period"
    And the draft and image counters match the drafts and pictures that exist, pending 0

  @negative
  Scenario: A4 · Stopping a run half-way charges only the drafts already written
    Given A3's drafts counted, and nothing discarded since
    When I generate 3 Single image posts for C
    And at the first draft card I click Stop run, then Stop and leave
    Then I land on /dashboard
    And 5 minutes later AI drafts reads 2 plus this run's drafts, 3 at most
    And the draft counter equals the trial runs' draft rows, pending 0
    # sql: select count(*) from posts p join generation_runs r on r.id = p.generation_run_id
    # sql:   join clients c on c.id = r.client_id where c.agency_id = :agency_id and r.period_key = 'trial';

  @positive
  Scenario: A5 · A rewrite counts one, once it is answered
    Given A3's drafts reopened in review from /generate for S
    When I click a draft's Rewrite button and wait
    Then the draft's text is replaced
    And Rewrites reads "1 of 5", and AI drafts and AI images are unmoved
    And the rewrite counter has pending 0

  @edge @core @write
  Scenario: A6 · Only the picture that lands on the 80 % line rings the image bell, once
    Given every earlier picture is painted, and SQL: trial image at 38
    When I click Regenerate visual once on a slide of S's drafts
    Then AI images reads "39 of 50" in ink, and no bell row is added
    When I click Regenerate visual once more
    Then one bell "An allowance is nearly used up" reads "40 of 50 AI images used this period."
    And exactly one allowance_warning:trial:image:50 row exists, with no client, and image pending 0

  @edge @write
  Scenario Outline: A8 · Each pool rings its own bell at its own line, and a pool that rang stays silent
    Given SQL: <period> <kind> at <at>
    When I <action>
    Then a new "An allowance is nearly used up" row starts "<used> used this period."
    And on the paid period it ends "Resets on ‹Renews on›."
    And that meter shows amber
    And allowance_warning:<period>:<kind>:<size> has one row, and no earlier key has a second

    Examples:
      | ID  | period | kind    | at | action                               | used               | size |
      | A8  | trial  | draft   | 9  | Regenerate visual, then 1 post for S | 10 of 12 AI drafts | 12   |
      | A9  | trial  | rewrite | 3  | rewrite a draft and wait             | 4 of 5 rewrites    | 5    |
      | A31 | paid   | draft   | 39 | generate 1 Single image post for C   | 40 of 50 AI drafts | 50   |

  @negative @write
  Scenario Outline: A10 · A pool at its cap refuses before reserving, for admin and member alike
    Given SQL: <period> <noun> at <cap>
    When the <who> clicks <button>, and once more after the toast
    Then both toasts read "You've used all <cap> <noun> for this period. <tail>"
    And the draft is unchanged
    And the meter reads "<cap> of <cap>" in red, and the counter stays <cap>, pending 0

    Examples:
      | ID  | period | cap | who    | button            | noun      | tail                              |
      | A10 | trial  | 5   | admin  | Rewrite           | rewrites  | Choose a plan to keep generating. |
      | A32 | paid   | 210 | admin  | Regenerate visual | AI images | Resets on ‹Renews on›.            |
      | A33 | paid   | 210 | member | Regenerate visual | AI images | Resets on ‹Renews on›.            |

  @edge @write
  Scenario: A11 · A dearer carousel is refused while a cheaper format still fits, and the form stays
    Given C's A4 drafts discarded, nothing owed, and SQL: trial image at 46, draft at 3
    When I open /generate for C and step through the formats
    Then at 6 slides it reads "You have 4 AI images left this period and this needs 6."
    And at 5 slides it ends "needs 5.", Generate is disabled, and the form stays shown
    And at 4 slides it reads "1 post left this period", and "Generate 1 post" is enabled
    And on Single image it reads "4 posts left this period"

  @negative @write
  Scenario: A12 · Priority briefs that push a run past what is left are refused in the panel
    Given SQL: trial draft at 10, image at 20
    When I open /generate for S on Single image and add 3 priority briefs
    Then the stepper is forced to 0, and the line reads "… · + 3 priority briefs · 3 posts total"
    And "Generate 3 posts" is disabled over "You have 2 posts left this period and this needs 3."
    When I remove one brief
    Then "Generate 2 posts" is enabled, and no run has been opened

  @negative @write
  Scenario: A13 · A second tab cannot spend the last draft twice
    Given SQL: trial draft at 11, image at 20
    And /generate for S open in two tabs, both reading "1 post left this period"
    When tab 2 generates 1 post, then tab 1, not reloaded, clicks "Generate 1 post"
    Then tab 1 toasts "You've used all 12 AI drafts for this period. Choose a plan to keep generating."
    And tab 1 then shows that sentence in place of its form
    And the draft counter is 12, never 13, pending 0, and only tab 2 opened a run

  @negative @core @write
  Scenario: A14 · Drafts used up: every Generate control refuses in the same words, even past the quota
    Refusal: "You've used all 12 AI drafts for this period. Choose a plan to keep generating."

    Given SQL: trial draft at 12
    When I open the dashboard
    Then Generate posts is disabled over the refusal, with a Plan & billing link
    And the tile, idle client rows and /generate for C show the same sentence
    When SQL: trial draft at 14
    Then the meter reads "14 of 12" in red with a full bar, no number is negative, and the refusal stays

  @edge @write
  Scenario: A16 · A reservation holds the cap but not the meter until the billing cron frees it
    Given SQL: trial draft at 3 used plus 3 reserved 20 minutes ago, and image at 20
    When I open Plan & billing and /generate for C
    Then AI drafts reads "3 of 12", but C's Single image reads "6 posts left this period"
    When the billing cron runs
    Then it answers "reservationsCleared" of 1 or more
    And after a reload C's Single image reads "9 posts left this period"
    # sql: update usage_counters set count = 3, pending = 3, reserved_at = now() - interval '20 minutes'
    # sql:   where agency_id = :agency_id and period = 'trial' and kind = 'draft';

  @positive @write
  Scenario: A18 · The generate cron stops at an empty drafts pool and rings "used up" once
    Given SQL: trial draft at 12, and C scheduled for this hour with How many 2
    When I curl the generate cron
    Then it answers 200 with "processed":0 and "skipped_over_allowance":["‹C's id›"]
    And a red bell reads "You've used all 12 AI drafts for this period. Choose a plan to keep generating."
    When I schedule S the same way and curl the generate cron again
    Then both are skipped with no run, and one allowance_reached:trial:draft:12 row remains, for C

  @edge @write
  Scenario: A20 · When pictures bind, the cron bell names pictures, and a batch is trimmed to fit
    Given S's schedule off, C still due, nothing owed, and SQL: trial draft at 3, image at 46
    When I curl the generate cron
    Then C is skipped, and a new bell reads "You have 4 AI images left this period and this needs 6. …"
    And it is keyed allowance_reached:trial:image:50, and drafts stay 3 with nothing reserved
    When just after a :10, C's How many is 3, SQL: trial image at 37, and I curl the generate cron
    Then it answers "processed":1 with at most 2 posts, waiting in /review without pictures

  @edge @write
  Scenario: A22 · Pictures owed by waiting posts are set aside, and named only when they are the cause
    Given before the next :10, 2 posts wait for 12 pictures, with trial images at 37
    When I open /generate for C on Carousel, 6 slides
    Then it reads "2 posts still waiting for pictures need 12 AI images; you have 13 left this period."
    And "Generate 0 posts" is disabled, and Single image reads "1 post left this period"
    When SQL: trial image at 38
    Then the dashboard and /generate for C refuse: "… you have 12 left this period. Choose a plan …"

  @edge
  Scenario: A24 · Another client's waiting pictures stop a batch, and the image bell is not rung twice
    Given A22's state before the next :10, and S scheduled for this hour with How many 1
    When I curl the generate cron
    Then S is skipped, and C is not listed
    And no bell row is added, and S has no run

  @positive
  Scenario: A25 · The visuals cron paints waiting posts whole, counting each picture as it lands
    Given trial images at 38, with 12 owed by C's two carousels
    When I curl the visuals cron, again if "skipped_for_time" is above 0
    Then it answers 200 with "posts":2, "failed":0, "skipped_allowance":0
    And both posts in /review show all 6 pictures
    And AI images reads "50 of 50" in red, and no "nearly used up" row appears
    And the dashboard's Generate posts is disabled over "You've used all 50 AI images for this period. …"

  @edge @write
  Scenario Outline: A26 · Posts the pool cannot paint whole ring "waiting for pictures" once per period
    Given <waiting> wait in /review without pictures, and SQL: <period> image at <cap>
    When I curl the visuals cron
    Then one red row starts "<n> posts in your review queue are waiting for pictures,"
    And it goes on "and this period's AI images cannot cover them. <tail>"
    And it is keyed images_waiting:<period>:<cap>, type allowance_reached, with no client
    And a second curl adds no second row

    Examples:
      | ID  | period | waiting              | cap | n                | tail                              |
      | A26 | trial  | 2 S posts made at 30 | 50  | 2                | Choose a plan to keep generating. |
      | A47 | paid   | A46's new posts      | 210 | those scoring 5+ | Resets on ‹Renews on›.            |

  @negative @write
  Scenario: A29 · In the trial's grace no picture is painted or regenerated, and no allowance bell rings
    Given A-test's trial ended yesterday by SQL, with S's posts waiting for pictures
    When I curl the visuals cron
    And I click Regenerate visual twice on a draft
    Then each click toasts "Your trial ended on D. Scheduled posts still go out until D+7;"
    And the toast ends "choose a plan to keep generating."
    And no picture is made, no allowance bell rings, and the counters are unchanged

  @positive @clock
  Scenario: A30 · Subscribing opens a fresh allowance for the slots paid; the trial's counters stay
    Given STRIPE_TEST_CLOCK is deployed, both schedules are off, and A-test has no Stripe customer
    When I leave "Clients to pay for" at 2 and pay Choose plan with 4242 4242 4242 4242
    Then Plan & billing reads Clients "2 of 2", AI drafts "0 of 50", AI images "0 of 210", Rewrites "0 of 30"
    And after the next :10, AI images reads "2 of 210"
    And the 'trial' counters are unchanged, and the new period key has none, or only zeros
    # sql: select client_slots, subscription_quantity from agencies where id = :agency_id;  -- 2 · 2

  @positive @core @clock
  Scenario: A36 · The renewal resets every meter to zero for the new period
    Given A-test on Pro with 2 client slots, with some allowance used
    When I advance the test clock to a day after "Renews on", and the renewal is paid
    Then Plan & billing shows "Renews on" a month later
    And the meters read "0 of 50", "0 of 210", "0 of 30" in ink
    And the new period starts at the old one's end, its invoice billing the 2 slots ordered
    And the old counters stay under their key, and the new key has none, or only zeros

  @negative
  Scenario: A37 · A replayed paid invoice resets nothing
    Given 1 Single image post generated for C since the renewal, so AI drafts reads "1 of 50"
    When I resend the renewal's and A30's first invoice.paid from Stripe → Developers → Events
    Then each answers {"received":true,"duplicate":true}
    And AI drafts still reads "1 of 50", and "Renews on" is unchanged
    And the draft counter is 1

  @edge @clock
  Scenario: A38 · Drafts of a run a renewal overtakes count in the period they were reserved from
    Given /generate for C on Single image with 3 posts
    When I click "Generate 3 posts" and at once advance the test clock to a day after "Renews on"
    Then if the renewal landed first, AI drafts reads "0 of 50" after a reload
    And AI images counts only pictures landed after the renewal, and no meter goes negative
    And the run's period_key is the ended period's, whose draft counter includes its drafts
    And every pending is 0

  @edge @clock @write
  Scenario: A39 · A failed renewal keeps the ended period's meters, and a refusal asks for the card
    Given the card in Manage billing replaced with 4000 0000 0000 0341
    When I advance the test clock to a day after "Renews on", and the renewal fails
    Then the meters keep the ended period's figures, not zero
    When SQL: paid image at 210, and I click Regenerate visual
    Then the toast reads "You've used all 210 AI images for this period."
    And it goes on "Update your card in Plan & billing to continue."

  @positive @write
  Scenario: A41 · A house workspace is counted but never metered, refused or warned
    Given A-house with client H, and its plan set to house by SQL
    When I open /generate
    Then no "… posts left this period" line shows, and the stepper reaches 7 in every format
    When I generate 1 post, then SQL: house draft and image at 5000, and I generate 1 more
    Then Plan & billing reads "5001 AI drafts" and "5001 AI images", with no "of"
    And there is no allowance bell

  @edge
  Scenario: A43 · A house workspace's month turns at UTC midnight, not Sofia midnight
    Given A-house on house, at about 00:30 Sofia time on the 1st
    When I generate 1 Single image post
    Then Plan & billing shows last month's totals plus 1, under the previous 'YYYY-MM'
    When I generate another after 03:00 Sofia time, 02:00 from November
    Then Plan & billing shows only the new month's "1 AI drafts", under the new 'YYYY-MM'

  @edge @write
  Scenario: A44 · With one picture left, the first click's reservation holds the cap until its picture lands
    Given A-test active again, and C's single-image drafts each have a picture
    And SQL: paid image at 209, and /generate for C open in two tabs
    When tab 1 regenerates draft 1's visual and, within 20 seconds, tab 2 another draft's
    Then tab 2 toasts "You've used all 210 AI images for this period. Resets on ‹Renews on›."
    And while tab 1's picture is made, the image row shows count 209, pending 1
    And then AI images reads "210 of 210" in red, never 211, with pending 0

  @negative @clock
  Scenario: A45 · A payment this app did not make leaves the period and the meters alone
    Given Plan & billing's "Renews on" and its three meters are noted
    When I charge a one-off €1.00 invoice to A-test's customer in the Stripe Dashboard
    Then its invoice.paid answers 200 "undocumented_sale"
    And "Renews on", the meters and the bell are as noted
    And the subscription keeps its period, quantity 2 and status, and the counters are unchanged

  @edge @write
  Scenario: A46 · One cron run, two clients, three drafts left: the second batch fits what is left
    Given just after a :10, nothing owed, and SQL: paid draft at 47, image at 100
    And S and C scheduled for this hour, How many 2 each, C on Carousel, 6 slides
    When I curl the generate cron, again if a client is in "skipped_for_time"
    Then "processed" totals 2, "posts_created" at most 3, and "skipped_over_allowance" is empty
    And AI drafts never passes 50, and AI images still reads "100 of 210"
    And the second run targets 3 minus the first's drafts, and the draft counter has pending 0

  @edge @write
  Scenario: A48 · Both paid pools empty: the cron bell names the drafts and the reset date
    Given SQL: paid draft at 50, with images at 210 and A46's posts still owed
    And S scheduled for this hour
    When I curl the generate cron
    Then it answers "processed":0 and "skipped_over_allowance":["‹S's id›"]
    And one new red row reads "You've used all 50 AI drafts for this period. Resets on ‹Renews on›."
    And it is keyed allowance_reached:‹period key›:draft:50, for S, and drafts stay 50 with pending 0

  @edge @write
  Scenario: A51 · A charged slot raise grows a used-up pool, and its bell rings once more for the bigger pool
    Given A48's row has rung, S is scheduled for this hour, and "Renews on" is over 13 hours away
    When I step Client slots from 2 to 3, click Change, and confirm "Add slot"
    Then the toast reads "You now pay for 3 clients. The invoice for the rest …"; limits 75 / 315 / 45
    When SQL: paid draft at 75, and I curl the generate cron twice
    Then one new red row reads "You've used all 75 AI drafts for this period. Resets on ‹Renews on›."
    And it is keyed allowance_reached:‹period key›:draft:75, beside A48's …:draft:50 row, for S
