Feature: Trying Kontuur for free
  As an agency owner or a business owner who has not paid for Kontuur yet
  I want to try it for 14 days with no card, within clear limits, and be warned before anything stops
  So that I can judge it on real work and choose a plan without losing what I made

  @core @positive
  Scenario: 1.1 · I sign up as an agency and get a 14-day trial, with no card asked for
    Given I am a new agency owner, and the sign-up dialog says "14-day trial · no card required"
    When I sign up as "E2E Agency", choosing "I manage social media for clients", and confirm my email
    Then I land on my dashboard, with no banner above it
    And Plan & billing shows plan "Trial", status "Trial" in amber, and "Trial ends" ‹sign-up day + 14›
    And it shows Clients "0 of 3", AI drafts "0 of 12", AI images "0 of 50" and Rewrites "0 of 5"
    And "Clients to pay for" reads 1 and goes no lower, with "1 client × €29.00 = €29.00 a month excl. VAT"

  @core @positive
  Scenario: 1.2 · I sign up for my own business, set it up first, and my trial holds that one business
    Given I am a new business owner with no Kontuur account
    When I sign up as "E2E Solo", choosing "I manage my own business socials", and confirm my email
    Then I land on the setup form for my business, not on the dashboard
    When I fill it in from my website and save
    Then I see "Profile saved", and once I leave setup, the sidebar reads "My business" and "Create content"
    And Plan & billing has Business "1 of 1" in red, meters at 0, "€29.00 a month excl. VAT for your business"

  @edge
  Scenario Outline: 1.3 · Until my business is set up, every page sends me back to the setup form
    Given I am the business owner of "E2E Solo Two", signed up, but my setup form was never saved
    When I open <page> by its address
    Then I am back on the setup form for my business

    Examples:
      | page                  |
      | Settings, Account tab |
      | the Dashboard         |
      | My calendar           |
      | Create content        |

  @positive
  Scenario: 1.4 · My invited teammate sees our trial and its allowance, but cannot buy a plan
    Given I am the agency owner of "E2E Agency" on my trial
    When I invite my teammate as a Member under Settings, Team, "Invite a team member"
    Then I see "Invite sent to ‹their email›"
    When my teammate accepts the invitation and opens Plan & billing
    Then they see the same plan, status, trial end and meters as I do
    And they see no "Choose plan", no price and no Invoices; the header reads 2 members, Trial plan

  @core @positive
  Scenario: 1.5 · I add my three trial clients and pay nothing
    Given I am the agency owner of "E2E Agency" on my trial, with no clients
    When I add "Client One", "Client Two" and "Client Three" from their websites
    Then each save shows "Client saved", and "Add client" never shows a price, under it or in Cmd+K
    And Plan & billing's Clients reads "1 of 3", then "2 of 3", then "3 of 3" in red with a full bar
    And there "Clients to pay for" starts at 3: "You have 3 clients, so you pay for at least 3."
    And I am never asked for a card

  @core @negative
  Scenario Outline: 1.6 · My trial's fourth client is refused wherever I try, with the way past it
    Given I am the agency owner of "E2E Agency" on my trial, with 3 clients
    When I <try>
    Then I see "Trial includes 3 clients. Choose a plan to add more." <where>
    And I still have 3 clients

    Examples:
      | try                                           | where                                                |
      | press "Add client" on the dashboard           | under the disabled button, and a Plan & billing link |
      | press "Add client" on the Clients page        | under the disabled button, and a Plan & billing link |
      | pick "Add client" in the Cmd+K search         | as its dimmed hint, and nothing opens                |
      | save the add-client form, typed in by address | as a toast, and the form stays open                  |
      | save a form I opened before my third client   | as a toast, and that client is not added             |

  @negative
  Scenario Outline: 1.7 · My solo workspace offers no second business and no way to delete mine
    Given I am the business owner of "E2E Solo" on my trial, with my business set up
    When I <do>
    Then I see <result>
    And I still have one business

    Examples:
      | do                                 | result                                          |
      | open "My business" in the sidebar  | my business's own settings, with no Danger zone |
      | look at my dashboard               | "Create content", and no "Add client"           |
      | search "Add" in Cmd+K              | "Nothing matches “Add”."                        |
      | search "Delete" in Cmd+K           | "Nothing matches “Delete”."                     |
      | save the setup form by its address | "Your plan covers one business."                |

  @edge
  Scenario: 1.8 · Deleting a client at my trial's cap makes room for another, and the dialog names no bill
    Given I am the agency owner of "E2E Agency" on my trial, with 3 clients
    When I press "Delete client" in Client Three's Danger zone, type its name and press "Delete permanently"
    Then the dialog's warning ended with "This cannot be undone." and said nothing about my bill
    And Plan & billing reads Clients "2 of 3", with "2 clients × €29.00 = €58.00 a month excl. VAT"
    And "Add client" on the dashboard can be pressed again
    And when I add Client Three back, I see "Client saved" and Clients reads "3 of 3" again

  @core @edge @write
  Scenario Outline: 1.9 · My meters turn amber near a limit and red at it, and Generate stops at a cap
    Given I am the agency owner of "E2E Agency" on my trial, having used <use>
    When I open Plan & billing and the dashboard
    Then that meter reads <meter>
    And the dashboard's "Generate posts" shows <refusal>
    And a refusal goes on "Choose a plan to keep generating.", with a Plan & billing link

    Examples:
      | use                | meter               | refusal                                           |
      | 9 of 12 AI drafts  | "9 of 12"           | no refusal                                        |
      | 10 of 12 AI drafts | "10 of 12" in amber | no refusal                                        |
      | 11 of 12 AI drafts | "11 of 12" in amber | no refusal                                        |
      | 12 of 12 AI drafts | "12 of 12" in red   | "You've used all 12 AI drafts for this period. …" |
      | 13 of 12 AI drafts | "13 of 12" in red   | "You've used all 12 AI drafts for this period. …" |
      | 49 of 50 AI images | "49 of 50" in amber | no refusal                                        |
      | 50 of 50 AI images | "50 of 50" in red   | "You've used all 50 AI images for this period. …" |
      | 4 of 5 rewrites    | "4 of 5" in amber   | no refusal                                        |
      | 5 of 5 rewrites    | "5 of 5" in red     | no refusal                                        |

  @negative @write
  Scenario: 1.10 · With more than three days left, nothing warns me yet
    Given I am the agency owner of "E2E Agency" and my trial ends in 3 days and 2 hours
    When the daily reminders go out
    Then no page shows a banner, and no bell or email arrives
    And Plan & billing's "Trial ends" shows that date

  @core @positive @write
  Scenario: 1.11 · In my trial's last three days, a banner, one bell each and one email tell me
    Given I am the agency owner of "E2E Agency", with a teammate, and my trial ends in 2 days 23 hours
    When the daily reminders go out
    Then we both see the amber banner "Your trial ends on ‹date› — choose a plan to keep generating."
    And we each get the bell "Your trial ends soon", whose "Open plan & billing →" opens Plan & billing
    And only I get the email "Your Kontuur trial ends soon", with a "Choose a plan" button
    And when the reminders go out again that day, no second bell or email arrives

  @edge @write
  Scenario: 1.12 · A new trial end date reminds me once more; a new timezone does not
    Given I am the agency owner of "E2E Agency", already reminded that my trial ends on ‹date›
    When Kontuur moves my trial's end to tomorrow at 22:30 UTC, and the daily reminders go out
    Then the banner, another "Your trial ends soon" bell and "Your Kontuur trial ends soon" email say tomorrow
    When I set my timezone to Europe/Sofia in Settings, save, and the reminders go out again
    Then I see "Workspace updated", and the banner and "Trial ends" name the day after tomorrow
    And no new bell or email arrives, even after Kontuur moves my trial's end half an hour later

  @core @positive @write
  Scenario: 1.13 · My trial has ended: a red banner, the date I pause, one bell and one email
    Given I am the agency owner of "E2E Agency" with 3 clients, and my trial ended yesterday
    When the daily reminders go out, twice
    Then, once each, I get only the "Your trial has ended" bell and the "Your Kontuur trial has ended" email
    And a red banner begins "Your trial ended on ‹date›. Scheduled posts still go out until ‹date + 7›"
    And Plan & billing shows "Trial ended" in red, "Workspace pauses on" ‹date + 7› and "3 clients"
    And "Choose plan" is still offered, and the meters give way to the banner's sentence

  @core @negative @write
  Scenario Outline: 1.14 · After my trial nothing new is made, and each refusal tells me why
    Given I am the agency owner of "E2E Agency", and my trial ended yesterday
    When I <try>
    Then <I see>
    And no new draft appears

    Examples:
      | try                                     | I see                                                     |
      | press "Generate posts" on the dashboard | it is disabled, with the red banner's sentence            |
      | open "Generate posts" in the sidebar    | the Generate page: the banner's sentence and no form      |
      | press "Add client" on the dashboard     | "Choose a plan to add clients." and a Plan & billing link |
      | open the new-client form by its address | Plan & billing opens instead                              |

  @positive @write
  Scenario: 1.15 · After my trial, my waiting drafts can still be approved, and scheduled posts go out
    Given I am the agency owner of "E2E Agency", my trial ended yesterday, Client One's Instagram is linked
    When I approve a draft of Client One waiting on Generate posts, for Instagram, 10 minutes from now
    And I schedule two more of its drafts for Instagram tomorrow
    Then all three are accepted
    When the first one's time comes
    Then it appears on Client One's Instagram and shows as published in my calendar

  @edge @write
  Scenario Outline: 1.16 · Plan & billing turns over by itself the minute my trial ends or my workspace pauses
    Given I am the agency owner of "E2E Agency" and <what> in 3 minutes
    When I open Plan & billing
    Then it shows <before>
    When 4 minutes have passed and I reload it
    Then it shows <after>

    Examples:
      | what                | before                           | after                                   |
      | my trial ends       | "Trial" in amber, with my meters | "Trial ended" in red, pausing in 7 days |
      | my workspace pauses | "Trial ended", pausing today     | "Paused" in red, with no date           |

  @core @positive @write
  Scenario: 1.17 · Once paused, every page but Settings shows one card that tells me the way back
    Given I am the agency owner of "E2E Agency" and my trial ended 8 days ago
    When I open Dashboard, Clients, Review queue, Calendar, Comments, Client ideas and Analytics
    Then each shows only the "Workspace paused" card, and no banner
    And the card says "Your workspace is paused. Choose a plan to generate, schedule and publish again."
    And its small print begins "The workspace keeps everything you made. Once a plan is active,"
    And its one button, "Choose a plan", opens Plan & billing, showing "Paused" in red and "Choose plan"

  @positive @write
  Scenario: 1.18 · I am told once, by bell and by email, that my workspace is paused
    Given I am the agency owner of "E2E Agency", with a teammate, and my workspace paused yesterday
    When the daily reminders go out, twice
    Then my teammate and I each get one bell "Your workspace is paused"
    And it says "Your workspace was paused on ‹date›. Choose a plan to generate, schedule and publish again."
    And only I get the email "Your Kontuur workspace is paused", once, with a "Choose a plan" button

  @edge @write
  Scenario Outline: 1.19 · A pause I was never told of is still announced within a week, never later
    Given I am the agency owner of "E2E Agency", paused <ago>, and never told of this pause
    When the daily reminders go out
    Then <what arrives>
    And the "Workspace paused" card stays on every page but Settings

    Examples:
      | ago                      | what arrives                                                   |
      | 7 days ago, less 2 hours | the "Your workspace is paused" bell and email, naming that day |
      | 8 days ago               | no bell and no email                                           |

  @negative @write
  Scenario Outline: 1.20 · While paused, creating anything opens Plan & billing, and a client's page the card
    Given I am the agency owner of "E2E Agency", which is paused
    When I <go>
    Then I see <result>

    Examples:
      | go                                      | result                           |
      | open "Generate posts" in the sidebar    | Plan & billing, showing "Paused" |
      | open the add-client form by its address | Plan & billing, showing "Paused" |
      | open a client's settings by its address | the "Workspace paused" card      |

  @edge @write
  Scenario Outline: 1.21 · With my business never set up, after the trial I am let in and told why
    Given I am the business owner of "E2E Solo Two", never set up, and my trial ended <ago>
    When I open the dashboard
    Then I stay there, not sent to the setup form, and see <what>
    And Plan & billing shows <status> and "0 businesses"
    And opening the setup form by its address takes me to Plan & billing instead

    Examples:
      | ago        | what                                                            | status        |
      | yesterday  | the red banner, and "Create content" disabled with its sentence | "Trial ended" |
      | 8 days ago | only the "Workspace paused" card                                | "Paused"      |

  @edge @write
  Scenario: 1.22 · On Kontuur's Internal plan my workspace never pauses and is never asked to pay
    Given I am the agency owner of "E2E Agency" on the Internal plan, 9 days past my old trial end
    When I open the dashboard and Plan & billing, and the daily reminders go out
    Then there is no "Workspace paused" card and no banner, and "Generate posts" and "Add client" work
    And Plan & billing shows "Internal" and "Active" in green, with plain counts and no limits
    And there is no "Choose plan", and no bell or email arrives

  @positive @write
  Scenario: 1.23 · I choose a plan with 2 trial days left: it starts today, and the trial reminders stop
    Given I am the agency owner of "E2E Agency Three", with no clients, and my trial ends in 2 days
    And I see the amber banner "Your trial ends on ‹date› — choose a plan to keep generating."
    When I press "Choose plan" with "Clients to pay for" at 1, and pay with a good card at a Bulgarian address
    Then my card is charged €34.80: €29.00 for one client plus 20 % Bulgarian VAT
    And a minute later Plan & billing shows "Pro", "Active", "Renews on" ‹a month from today›, no banner
    And when the daily reminders go out, no "Your trial ends soon" bell or email arrives

  @edge @write
  Scenario: 1.24 · Posts that came due while I was paused wait; once I pay, the recent one goes out
    Given I am the agency owner of "E2E Agency", paused, with two Client One posts scheduled for Instagram
    When their times pass while I am paused, one an hour ago and the other two days ago
    Then neither appears on Client One's Instagram
    When I pay €104.40 at Checkout with "Clients to pay for" at 3, and the "Workspace paused" card goes away
    Then the post due an hour ago appears on Instagram and shows as published in my calendar
    And the older one shows as failed in my calendar, "Missed publish window", for me to reschedule
