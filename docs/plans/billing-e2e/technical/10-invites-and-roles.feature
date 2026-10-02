Feature: Invites, roles and the settings routes
  Admins invite, promote, remove and rename; everyone else is refused.
  Nothing leaks between workspaces.

  # Run order: top to bottom; S36 last.

  Background:
    Given S-Alpha (adm-a) and S-Beta (adm-b) are agency workspaces on their trial
    And each address you+x1@… to you+x20@… is unused before its scenario
    And each person uses their own private window

  @positive @core
  Scenario: S1 · An invite to a fresh address records one pending invite and sends one email
    Given adm-a is on Settings → Team
    When adm-a invites you+x1@… as Member
    Then the toast reads "Invite sent to you+x1@…"
    And x1 gets one email: "S-Alpha has added you to their workspace on Kontuur."
    And S-Alpha has one pending member invite, invited_by adm-a, on x1's unconfirmed login
    And the login's metadata has agency_name "S-Alpha", no invited_agency_id and no role
    # sql: select t.role, t.invited_by, u.email_confirmed_at, u.raw_user_meta_data
    #   from public.team_invites t join auth.users u on u.id = t.auth_user_id
    #   where t.agency_id = :agency_id and lower(u.email) = lower(:email);

  @positive @core
  Scenario: S2 · The invitee is a member the moment the link opens, and the link works only once
    When x1 opens S1's invite link in a new private window
    Then x1 is a member of S-Alpha before any password is set
    When x1 sets a password
    Then adm-a's Team shows x1 as "Member" and "2 members"
    When the same link is opened signed out in a new private window
    Then it ends on the sign-in dialog

  @negative
  Scenario Outline: S4 · An address already on this team is refused, and nothing is sent
    Given x1 is a confirmed member of S-Alpha
    When adm-a invites <address> as <role>
    Then a red toast reads "This email is already a team member"
    And no email goes out, and no invite row or login changes

    Examples:
      | ID  | address                         | role   |
      | S4  | "  YOU+X1@…  " with spaces      | Member |
      | S39 | adm-a's own address             | Admin  |

  @negative @core
  Scenario Outline: S8 · An address with a confirmed account in another workspace is refused
    Given x1 is a confirmed member of S-Alpha
    When <inviter> invites <address> as Member
    Then a red toast reads "This email already has an account. They cannot be invited again."
    And no email goes out, and no invite row names the address

    Examples:
      | inviter | address         |
      | adm-a   | adm-b's address |
      | adm-b   | you+x1@…        |

  @negative
  Scenario Outline: S5 · Bad invite input is refused in the form and again at the route
    Given adm-a is on Settings → Team
    And console posts go to /api/settings/team/invite
    When adm-a <does>
    Then <observed>
    And no login exists for you+bad@…

    Examples:
      | does                          | observed                           |
      | submits "not-an-email"        | "Enter a valid email"; no request  |
      | clears the field              | Send invite is disabled            |
      | submits three spaces          | "Email is required"; no request    |
      | posts role "owner"            | 400 "Invalid request body"         |
      | posts email "not-an-email"    | 400 "Valid email is required"      |
      | posts role "member", no email | 400 "Invalid request body"         |
      | posts the body "hello"        | 400 "Invalid request body"         |

  @edge
  Scenario: S6 · A double submit sends one invite, and a second tab's invite is a resend, not a second row
    Given adm-a has two tabs on Settings → Team
    When adm-a double-clicks Send invite for you+x2@… as Member in tab 1
    Then tab 1 shows exactly one toast "Invite sent to you+x2@…"
    When tab 2 invites you+x2@… as Member within a minute
    Then x2 has two invite emails, kept for S7
    And x2 has one login and one pending invite

  @positive
  Scenario: S7 · A resend as Admin changes the role on the same login, and only the newest link works
    When adm-a invites you+x2@… again as Admin
    Then the one pending invite keeps S6's login, now with role admin
    When the second email's link is opened in a new private window
    Then it ends on the sign-in dialog
    When the newest link is opened in another private window and a password is set
    Then adm-a's Team shows x2 as "Admin"

  @negative @core
  Scenario: S9 · An address held by another workspace's pending invite is refused
    Given adm-b has invited you+x3@… as Member
    When adm-a invites you+x3@… as Member
    Then a red toast reads "This email has a pending invite to another workspace."
    And S-Beta's pending invite to x3 is unchanged, and x3 has no S-Alpha email

  @edge @write
  Scenario: S10 · The 7-day hold refuses an hour before it lapses; after it, the address is taken over
    Given by SQL, S-Beta's invite to x3 was sent 6 days 23 hours ago
    When adm-a invites you+x3@… as Member
    Then it is refused "This email has a pending invite to another workspace."
    When by SQL that invite was sent 7 days 5 minutes ago, and adm-a invites again
    Then "Invite sent to you+x3@…", and x3 is on a new login id
    And S-Beta's invite is gone, and adm-b's new invite to x3 is refused

  @edge
  Scenario: S11 · A squatter's unconfirmed sign-up is replaced by the invite's own login
    Given someone signed up as business "Squatter" with you+x4@… and password P, never confirmed
    When adm-a invites you+x4@… as Member
    Then x4's login has a new id with agency_name "S-Alpha"
    And no Squatter workspace exists
    And signing in with P is refused "Invalid login credentials"
    And S-Alpha's invite link, after a password, lands on S-Alpha's dashboard

  @negative @core
  Scenario Outline: S12 · A forged sign-up whose metadata claims S-Alpha admin never joins S-Alpha
    Given you+<who>@… signed up through Supabase's signup API with metadata <metadata>
    When its confirmation link is opened in a new private window and a password is set
    Then <result>
    And adm-a's Team does not list it, and no invite row names it

    Examples:
      | ID  | who    | metadata                        | result                               |
      | S12 | forge1 | S-Alpha admin, "Forged Co"      | it is admin of "Forged Co" only      |
      | S13 | forge2 | S-Alpha admin, no business name | a server error, no users row         |

  @edge
  Scenario: S14 · An invitee who leaves before choosing a password is already a member and can reset it
    Given adm-a has invited you+x5@… as Member
    When x5 opens the link and closes the window on "Set your password"
    Then x5 is a member of S-Alpha
    And a second invite to x5 is refused "This email is already a team member"
    When x5 uses Forgot your password? for you+x5@…
    Then the reset link leads through "Set your password" to S-Alpha's dashboard

  @negative
  Scenario Outline: S15 · A member sees no team controls, and the invite route answers 403
    Given x1 is signed in as a member of S-Alpha
    When x1 <does>
    Then <observed>
    And no invite email goes out

    Examples:
      | does                          | observed                                 |
      | opens Settings                | no Invite or Remove controls             |
      | posts an invite for you+x9@…  | 403 "Only admins can invite team members" |

  @negative @core
  Scenario Outline: S16 · A member gets no account or billing control, and the account route answers 403
    Given x1 is signed in as a member of S-Alpha
    When x1 <does>
    Then <observed>
    And S-Alpha keeps its name and timezone

    Examples:
      | does                                | observed                                        |
      | opens Settings → Account            | fields disabled, no billing or Danger zone      |
      | opens ?billing=success, =cancelled  | no return card, no cancel toast                 |
      | PUTs a new name, then a timezone    | both 403 "Only admins can update account settings" |

  @positive
  Scenario: S19 · A rename shows in new invites, while a resend keeps the name its login was made with
    Given adm-a has a pending invite to you+x6@… from before any rename
    When adm-a renames the workspace "S-Alpha Renamed", changes the timezone and saves
    Then the toast reads "Workspace updated"
    When adm-a invites you+x7@…, pending for S42, and invites you+x6@… again
    Then x7's email reads "S-Alpha Renamed has added you to their workspace on Kontuur."
    And x6's newest email still reads "S-Alpha has added you…"

  @negative
  Scenario Outline: S21 · Bad account settings are refused, and billing fields cannot be set through them
    Given adm-a is on Settings → Account after S19
    And console PUTs go to /api/settings/account
    When adm-a <sends>
    Then <answer>
    And the plan is still trial with no subscription

    Examples:
      | sends                               | answer                                   |
      | clears Agency name and saves        | "Agency name is required"; no request    |
      | PUTs timezone "Mars/Olympus"        | 400 "timezone: Unsupported timezone"     |
      | PUTs name "   "                     | 400 "name: Agency name cannot be empty"  |
      | PUTs {}                             | 400 "Nothing to update"                  |
      | PUTs plan, trial_ends_at, stripe id | 400 "Nothing to update"                  |
      | PUTs the same name + plan "house"   | 200; only the name is written            |
      | PUTs "hello", no content type       | 400 "Invalid request body"               |

  @positive @core
  Scenario: S22 · Removing a member deletes their login, and the address is fresh again
    Given x1 is a member, and x1's own window stays open for S23
    When adm-a clicks Remove on x1's row, then Remove permanently
    Then the toast reads "you+x1@… removed from the workspace"
    And x1 has no login, no users row and no invite rows
    And signing in as x1 is refused "Invalid login credentials"
    And a new invite to you+x1@… says "Invite sent to you+x1@…"

  @edge
  Scenario: S23 · A removed member's still-open tab reaches nothing
    Given S22 removed x1, and x1's old window is untouched
    When that tab PUTs {} to /api/settings/account twice, 3 seconds apart
    Then both answer 404 "User not found", or 401 once its token has expired
    When that tab is reloaded
    Then no S-Alpha page shows

  @edge
  Scenario: S24 · A just-removed admin's first click on Choose plan must not start a Checkout
    Given x2 is an admin of S-Alpha and has invited you+x10@…, pending for S28
    And S-Alpha has no Stripe customer, and x2's window sits on Plan & billing
    When adm-a removes x2, and x2's first action in that window is Choose plan
    Then a red toast reads "User not found" or "Only admins can manage the plan."
    And no Stripe page opens
    And S-Alpha's stripe_customer_id stays null

  @edge
  Scenario Outline: S25 · A removed admin's stale controls are all refused
    Given x2's window still shows the admin controls from before S24
    When x2 <does>
    Then a red toast reads "User not found" or "<refusal>"
    And <after>

    Examples:
      | does                    | refusal                                 | after                      |
      | invites you+x16@…       | Only admins can invite team members     | x16 gets no email          |
      | removes x5              | Only admins can remove team members     | x5 is still a member       |
      | renames it "Taken over" | Only admins can update account settings | the name is unchanged      |
      | deletes the workspace   | Only admins can delete the workspace.   | the workspace still exists |

  @positive @core
  Scenario: S27 · Deleting a workspace with a pending invite also deletes the invitee's login and link
    Given S-Gamma, admin you+g@…, is a fresh trial with an unopened invite to you+x8@…
    When its admin types "S-Gamma" in Delete workspace and clicks Delete permanently
    Then /goodbye shows "Your workspace is gone"
    And the workspace, its invites, x8's login and the admin's login are all gone
    And x8's invite link ends on the sign-in dialog
    And adm-a can now invite you+x8@…

  @edge
  Scenario: S28 · An invite outlives the admin who sent it
    Given x2 invited you+x10@… and was then removed in S24
    Then x10's invite is still pending, with invited_by null
    When x10 accepts and sets a password
    Then x10 lands on S-Alpha's dashboard as a member

  @edge
  Scenario: S29 · A day-old link has expired, and a resend brings the invitee in
    When x12 opens an invite link from adm-a sent over 24 hours ago
    Then it ends on the sign-in dialog
    When x12 uses Forgot your password? for you+x12@…
    Then the page says a reset link is on its way, but no email arrives
    When adm-a invites you+x12@… again
    Then the newest link, after a password, lands on S-Alpha's dashboard

  @edge @defect-D19
  Scenario: S30 · A solo workspace has no Team tab, but its invite route still sends
    Given S-Solo signed up solo, confirmed, and set up its first business
    When its admin opens /settings?tab=team
    Then there is no Team tab, and Account opens
    When the admin posts an invite for you+x13@… as member from the console
    Then it answers 200 {"success":true,"notice":null}
    And x13 gets an email naming S-Solo

  @negative
  Scenario Outline: S37 · Signed-out calls are refused, and a forged identity header changes nothing
    Given a new private window with no one signed in
    And forged calls send x-kontuur-user-id = adm-a's id
    When it <calls>
    Then it answers <answer>
    And S-Alpha is still named "S-Alpha Renamed"

    Examples:
      | calls                              | answer                                  |
      | POSTs an invite for you+x17@…      | 401 "Unauthorized"                      |
      | PUTs a forged rename to "Hijacked" | 401 "Unauthorized"                      |
      | curls /settings, forged header     | 307 to https://kontuur.app/?auth=signin |

  @negative @write
  Scenario Outline: S38 · A member writing straight to the database is refused
    Given the SQL editor runs as role authenticated, impersonating member x5
    When x5 runs <query>
    Then it fails with "<error>"
    And x5 is still a member
    # sql: update public.agencies set name = name, timezone = timezone where id = :agency_id;
    # sql: update public.users set role = role where id = :x5_id;
    # sql: insert into public.team_invites (agency_id, role, auth_user_id)
    #   select :agency_id, 'admin', :x5_id where false;
    # sql: select * from public.pending_invite_for_email('you+x7@…');

    Examples:
      | query                          | error                                                   |
      | the agencies update            | permission denied for table agencies                    |
      | the users update               | permission denied for table users                       |
      | the team_invites insert        | permission denied for table team_invites                |
      | the pending_invite_for_email   | permission denied for function pending_invite_for_email |

  @negative
  Scenario: S40 · A removal runs once: a double-click, then a stale second tab gets "Member not found"
    Given x3 is a member of S-Alpha, and adm-a has two tabs on Settings → Team
    When adm-a clicks Remove on x3 in tab 1 and double-clicks Remove permanently
    Then exactly one toast reads "you+x3@… removed from the workspace"
    When tab 2, not reloaded, removes x3 too
    Then a red toast reads "Member not found"
    And the member count dropped by one

  @edge
  Scenario: S41 · An invite link opened in the admin's own window swaps that window to the invitee
    Given adm-a is signed in in window A and has invited you+x18@… as Member
    When x18's link is opened in a new tab of window A and a password is set
    Then adm-a's other tab, reloaded, is x18's with no admin controls
    And adm-a is still S-Alpha's admin
    When window A signs out and signs in again as adm-a
    Then adm-a is back with the "Admin" pill

  @edge @write
  Scenario: S42 · The workspace's own invite older than the hold is still a resend, and restarts the hold
    Given x7 has been pending in S-Alpha since S19, never opened
    And by SQL, x7's invite was sent 8 days ago
    When adm-a invites you+x7@… again
    Then "Invite sent to you+x7@…" on the same login, the invite's age reset to minutes
    When adm-b invites you+x7@…
    Then a red toast reads "This email has a pending invite to another workspace."

  @edge @write
  Scenario: S43 · A paused workspace still invites; its new member hits a plan wall only admins can pass
    Given by SQL, S-Beta's trial ended 8 days ago
    When adm-b invites you+x19@… as Member, and x19 accepts and sets a password
    Then x19 lands on the "Workspace paused" wall with a Choose a plan link
    When x19 clicks Choose a plan
    Then Plan & billing opens with no Choose plan button: record a wording finding
    And after the trial end is restored by SQL, adm-b's dashboard has no wall

  @edge
  Scenario: S36 · Two admins removing each other at the same instant leave at least one admin
    Given S-Alpha has exactly two admins, adm-a and x14, side by side on Settings → Team
    When each removes the other, clicking Remove permanently at the same instant
    Then one window reads "… removed from the workspace"
    And S-Alpha still has exactly one admin
    # sql: select count(*) filter (where role = 'admin') from public.users where agency_id = :agency_id;
