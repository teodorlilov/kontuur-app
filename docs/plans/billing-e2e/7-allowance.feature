Feature: Keeping within my allowance of drafts, images and rewrites
  As the agency owner
  I want to see how much of my drafts, images and rewrites is left, and be warned before it runs out
  So that I am never surprised when Kontuur stops generating for my clients

  Background:
    Given I am the agency owner of "A-test", with client S on Single image and client C on 6-slide carousels
    And I also own "A-house", with one client H, which Kontuur has put on the Internal plan

  @positive @core
  Scenario Outline: 7.1 · Generate posts tells me how many whole posts my trial can still make
    Given my trial has just started, with nothing generated yet
    When I open Generate posts, pick S and choose <format>
    Then under "How many" I read "<left> posts left this period"
    And the + beside the posts count stops at <max>, while Plan & billing still reads AI drafts "0 of 12"
    And the panel says "Nothing publishes from here. You review every draft first."

    Examples:
      | format                  | left | max |
      | Single image            | 12   | 7   |
      | Carousel with 6 slides  | 8    | 7   |
      | Carousel with 10 slides | 5    | 5   |
      | Carousel with 3 slides  | 12   | 7   |

  @positive @core
  Scenario: 7.2 · My meters count the drafts, pictures and rewrites that actually landed
    Given my trial has just started, and Plan & billing reads "0 of 12", "0 of 50" and "0 of 5"
    When I generate 2 Single image posts for S and wait for both pictures
    Then Plan & billing reads AI drafts "2 of 12", AI images "2 of 50" and Rewrites "0 of 5"
    And Generate posts for C on Single image reads "10 posts left this period"
    When I rewrite one of S's drafts and see "Post rewritten"
    Then Rewrites reads "1 of 5", and AI drafts and AI images have not moved

  @negative
  Scenario: 7.3 · Stopping a run half-way uses up only the drafts already written
    Given AI drafts reads "2 of 12"
    When I start 3 Single image posts for C
    And at the first draft I click "Stop run", then "Stop and leave"
    Then I am taken back to my dashboard
    And a few minutes later AI drafts has grown only by the drafts C now has waiting, 3 at most

  @edge @core @write
  Scenario: 7.4 · The bell warns me once, when my AI images reach 80 %
    Given my trial has AI images at "38 of 50"
    When I click "Regenerate visual" on a slide and the new picture lands
    Then AI images reads "39 of 50", not amber, and the bell has nothing new
    When I regenerate two more pictures, one after the other
    Then exactly one "An allowance is nearly used up" row appears: "40 of 50 AI images used this period."
    And AI images reads "41 of 50" in amber, and clicking the row opens Plan & billing

  @edge @write
  Scenario Outline: 7.5 · My drafts and my rewrites each warn me once, at their own 80 % line
    Given my trial has <meter> at "<before>"
    When I <action>
    Then a new "An allowance is nearly used up" row reads "<after> <noun> used this period."
    And <meter> reads "<after>" in amber
    When I <action> once more
    Then no second warning about <noun> appears

    Examples:
      | meter     | noun      | before  | after    | action                             |
      | AI drafts | AI drafts | 9 of 12 | 10 of 12 | generate 1 Single image post for S |
      | Rewrites  | rewrites  | 3 of 5  | 4 of 5   | rewrite a draft and wait for it    |

  @edge @write
  Scenario: 7.6 · On my paid plan the warning rings again for the new period, and says when it resets
    Given my paid plan for 2 clients has AI drafts at "39 of 50", and my trial once warned me about drafts
    When I generate 1 Single image post for C
    Then a new "An allowance is nearly used up" row starts "40 of 50 AI drafts used this period."
    And it ends "Resets on ‹renewal date›.", and AI drafts reads "40 of 50" in amber

  @negative @core @write
  Scenario Outline: 7.7 · At the limit, a rewrite or a new picture is refused, and I am told what comes next
    Given my <plan> has <meter> at "<cap> of <cap>"
    When I click <button> on a draft, and click it again after the message
    Then both times I see "You've used all <cap> <noun> for this period. <next>"
    And the draft keeps its text and pictures, and <meter> still reads "<cap> of <cap>" in red

    Examples:
      | plan      | meter     | noun      | cap | button              | next                              |
      | trial     | Rewrites  | rewrites  | 5   | its rewrite button  | Choose a plan to keep generating. |
      | paid plan | AI images | AI images | 210 | "Regenerate visual" | Resets on ‹renewal date›.         |

  @negative @write
  Scenario: 7.8 · My teammate sees the same meters and refusals, but cannot change the plan
    Given my paid plan has AI images at "210 of 210", and my teammate has joined as a member
    When my teammate opens the dashboard, then clicks "Regenerate visual" on a draft
    Then "Generate posts" and the picture each say "You've used all 210 AI images for this period."
    And each goes on "Resets on ‹renewal date›.", and "Generate posts" is disabled
    When they follow the "Plan & billing" link beside "Generate posts"
    Then they see AI images "210 of 210" in red, and no "Cancel plan", "Manage billing" or Invoices

  @edge @write
  Scenario: 7.9 · A carousel too big for my pictures is refused, while a smaller one still fits
    Given my trial has AI images at "46 of 50" and AI drafts at "3 of 12"
    When I open Generate posts for C on Carousel with 6 slides
    Then I read "You have 4 AI images left this period and this needs 6." and "Generate 0 posts" is disabled
    And the rest of the form stays in place, so I can change the format
    When I lower the slides to 4, then switch to Single image
    Then at 4 slides "Generate 1 post" is enabled, and on Single image I read "4 posts left this period"

  @negative @write
  Scenario: 7.10 · Priority briefs are posts too, so they cannot push a run past what is left
    Given my trial has AI drafts at "10 of 12"
    When I open Generate posts for S on Single image and add 3 priority briefs
    Then "How many" drops to 0 posts, and the line under it counts 3 priority briefs, 3 posts total
    And "Generate 3 posts" is disabled, with "You have 2 posts left this period and this needs 3." under it
    When I remove one brief
    Then "Generate 2 posts" is enabled

  @negative @write
  Scenario: 7.11 · Two tabs cannot spend my last draft twice
    Given my trial has 1 of its 12 AI drafts left, and Generate posts for S is open in two tabs
    When I generate 1 post for S in the first tab, and wait for its draft
    And I click "Generate 1 post" in the second tab, without reloading
    Then the second tab says "You've used all 12 AI drafts for this period. Choose a plan to keep generating."
    And a moment later that tab shows the same sentence in place of the form
    And AI drafts ends at "12 of 12" in red, never higher

  @negative @core @write
  Scenario: 7.12 · With my drafts used up, every Generate button says so in the same words
    Given my trial has AI drafts at "12 of 12", and one of S's drafts is waiting for review
    When I open my dashboard
    Then "Generate posts" is disabled, with "You've used all 12 AI drafts for this period." under it
    And it goes on "Choose a plan to keep generating.", and its "Plan & billing" link shows "12 of 12" in red
    And the Generate posts tile and each empty client row's "Generate →" say the same
    And Generate posts for C shows it instead of the form, with "Plan & billing" and S's draft to "Review it"

  @edge @write
  Scenario: 7.13 · Drafts still held with no run left to finish them are free again the next morning
    Given my trial has AI drafts at "3 of 12", and 3 more still held, with no run left to finish them
    When I open Plan & billing, then Generate posts for C on Single image
    Then AI drafts reads "3 of 12", but Generate posts reads "6 posts left this period"
    When the next morning comes
    Then after a reload Generate posts reads "9 posts left this period"

  @negative @core @write
  Scenario Outline: 7.14 · Scheduled generation stops when my drafts are used up, and the bell tells me once
    Given my <plan> has AI drafts at "<cap> of <cap>"
    And S and C are both set to generate posts automatically this hour
    When their scheduled time comes, and the hour after
    Then no posts are written for S or C
    And exactly one new "An allowance is used up" row appears, with a red warning sign
    And it reads "You've used all <cap> AI drafts for this period. <next>"

    Examples:
      | plan                              | cap | next                              |
      | trial                             | 12  | Choose a plan to keep generating. |
      | paid plan (AI images used up too) | 50  | Resets on ‹renewal date›.         |

  @edge @write
  Scenario: 7.15 · When pictures run short, scheduled carousels stop, and the bell names the pictures
    Given my trial has AI images at "46 of 50" and AI drafts at "3 of 12"
    And only C, on 6-slide carousels, is set to generate 2 posts automatically this hour
    When C's scheduled time comes
    Then no posts are written for C, and a new "An allowance is used up" row appears
    And it reads "You have 4 AI images left this period and this needs 6. Choose a plan to keep generating."

  @edge @write
  Scenario Outline: 7.16 · A scheduled batch is cut down to what my allowance can still pay for
    Given my <plan> has <left> left
    And <who> set to generate <asked> automatically this hour
    When the scheduled time comes
    Then at least 1 and at most <most> posts are written, waiting in my review queue for their pictures
    And no "An allowance is used up" row appears, and AI images does not move until they get them

    Examples:
      | plan      | left                   | who                              | asked        | most |
      | trial     | 13 AI images, 9 drafts | only C, on 6-slide carousels, is | 3 posts      | 2    |
      | paid plan | 3 AI drafts            | S and C are both                 | 2 posts each | 3    |

  @edge @core @write
  Scenario: 7.17 · Pictures my waiting posts still need are kept for them before a new run
    Given 2 of C's 6-slide carousels wait in my review queue for 12 pictures, with AI images at "37 of 50"
    When I open Generate posts for C on Carousel with 6 slides
    Then I read "2 posts still waiting for pictures need 12 AI images; you have 13 left this period."
    And "Generate 0 posts" is disabled, while Single image reads "1 post left this period"
    When one more AI image is used, so AI images reads "38 of 50"
    Then my dashboard and Generate posts refuse: "… 12 left this period. Choose a plan to keep generating."

  @edge @write
  Scenario: 7.18 · Pictures another client's posts are waiting for also stop a scheduled batch
    Given C's 2 carousels still wait for 12 pictures, with AI images at "38 of 50"
    And the bell already has the row "You have 4 AI images left this period and this needs 6."
    And S is set to generate 1 post automatically this hour
    When S's scheduled time comes
    Then no post is written for S, and the bell has no new row

  @positive @core @write
  Scenario: 7.19 · My waiting posts get all their pictures, and each one counts as it lands
    Given C's 2 carousels wait for 12 pictures, AI images reads "38 of 50", and its warning already rang
    When the waiting posts' pictures are made, at ten past the hour
    Then both posts in my review queue show all 6 pictures
    And AI images reads "50 of 50" in red, with no new "An allowance is nearly used up" row
    And my dashboard's "Generate posts" is disabled: "You've used all 50 AI images for this period."
    And it goes on "Choose a plan to keep generating."

  @edge @write
  Scenario Outline: 7.20 · Posts my pictures cannot fully cover get none, and the bell tells me once a period
    Given my <plan> has AI images at "<cap> of <cap>", and <n> new scheduled posts wait for pictures
    When their pictures are due, at ten past the hour, and again at ten past for the next two hours
    Then those posts stay in my review queue with no pictures
    And exactly one new "An allowance is used up" row appears
    And it starts "<n> posts in your review queue are waiting for pictures,"
    And it goes on "and this period's AI images cannot cover them. <next>"

    Examples:
      | plan                    | cap | n | next                              |
      | trial                   | 50  | 2 | Choose a plan to keep generating. |
      | paid plan for 2 clients | 210 | 3 | Resets on ‹renewal date›.         |

  @negative @write
  Scenario: 7.21 · Once my trial has ended nothing more is generated, and I am told it is the trial
    Given my trial ended yesterday with drafts and pictures left, and C is set to generate this hour
    When I click "Regenerate visual" on one of S's drafts, twice
    Then each time I see "Your trial ended on ‹yesterday›. Scheduled posts still go out until ‹a week later›;"
    And the message ends "choose a plan to keep generating.", and no new picture is made
    And a rewrite is refused in the same words, and Plan & billing shows them in place of the meters
    And at the scheduled times C gets no posts, S's waiting posts get no pictures, and the bell is quiet

  @positive @core @clock @write
  Scenario: 7.22 · Choosing a plan gives me a fresh allowance for the slots I buy, whatever my trial used
    Given my trial has ended, 2 of S's posts wait for pictures, and no schedule is on
    When I leave "Clients to pay for" at 2, click "Choose plan" and pay in Checkout with my card
    Then Plan & billing shows Current plan "Pro", Status "Active", a "Renews on" date and "Client slots" at 2
    And AI drafts reads "0 of 50", AI images "0 of 210" and Rewrites "0 of 30", the allowance of 2 slots
    When the waiting posts' pictures are made, at ten past the hour
    Then S's 2 posts have their pictures, and AI images reads "2 of 210"

  @edge
  Scenario: 7.23 · A client slot I add raises this period's allowance once paid; a client I add does not
    Given my paid plan for 2 clients has used some of each allowance
    When I add a client slot in Plan & billing: + beside "Client slots", then "Change", then "Add slot"
    Then I read "You now pay for 3 clients. The invoice for the rest of this period is on its way by email."
    And the meters read "‹used› of 75", "‹used› of 315" and "‹used› of 45", the used figures unchanged
    When I add a third client
    Then the meters still read "‹used› of 75", "‹used› of 315" and "‹used› of 45", and nothing is charged

  @edge @clock
  Scenario: 7.24 · A run still going when my plan renews does not use up my new month's drafts
    Given my paid plan is about to renew, and Generate posts for C is set to 3 Single image posts
    When I click "Generate 3 posts", and my plan renews before the run finishes
    Then after a reload AI drafts reads "0 of 50", though the run's drafts are there for me to review
    And AI images counts only the pictures made after the renewal
    And no meter shows a negative number

  @edge @clock @write
  Scenario: 7.25 · After a failed renewal, a refusal at my limit asks for my card, not a reset date
    Given my renewal payment was declined, and AI images reads "210 of 210"
    When I click "Regenerate visual" on a draft
    Then I see "You've used all 210 AI images for this period."
    And it goes on "Update your card in Plan & billing to continue.", with no "Resets on" date

  @edge @write
  Scenario: 7.26 · My last picture is held for the one being made, so a second tab cannot take it
    Given my paid plan has AI images at "209 of 210", and C's drafts are open in two tabs
    When I regenerate draft 1's picture in the first tab
    And while it is still being made, I regenerate draft 2's picture in the second tab
    Then the second tab shows "You've used all 210 AI images for this period. Resets on ‹renewal date›."
    And once the first picture lands, AI images reads "210 of 210" in red, never higher

  @positive @write
  Scenario: 7.27 · On the Internal plan my usage is counted but never capped or warned
    Given I sign in to "A-house" instead
    When I open its Plan & billing, then Generate posts
    Then Current plan reads "Internal", and the meters are plain counts such as "0 AI drafts", with no bar
    And Generate posts says nothing about posts left, and the posts count's + reaches 7 in every format
    When its usage reaches 5000 drafts and 5000 images, and I generate 1 more post
    Then the post is made, Plan & billing reads "5001 AI drafts" and "5001 AI images", and no bell rings

  @edge @write
  Scenario: 7.28 · On the Internal plan my counts start again each month, a few hours after Sofia midnight
    Given it is about 00:30 Sofia time on the 1st, and I am signed in to "A-house"
    When I generate 1 Single image post
    Then Plan & billing still shows last month's counts, plus 1
    When I generate another after 03:00 Sofia time, or after 02:00 from November
    Then Plan & billing shows only this month's "1 AI drafts"
