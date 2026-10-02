Feature: Building and running my team
  As the agency owner
  I want to invite colleagues, choose what they may do, and remove them when they leave
  So that the right people work on my clients, while the plan and the client list stay with admins

  Background:
    Given "S-Alpha" and "S-Beta" are agency workspaces on their trial, each with its own owner

  @core @positive
  Scenario: 8.1 · I invite a colleague and they get one email naming my workspace
    Given I am the agency owner of "S-Alpha", alone on Settings → Team
    When I invite you+x1@… as Member
    Then the toast reads "Invite sent to you+x1@…", and the form is empty again
    And "Team members" still reads "1 member": my own row, marked "You", with no Remove button
    And you+x1@… gets one email, "You have been invited to Kontuur", with an "Accept invitation" button
    And the email reads "S-Alpha has added you to their workspace on Kontuur."

  @core @positive
  Scenario: 8.2 · I accept an invite, choose a password and I am in; the link works only once
    Given the owner of "S-Alpha" invited me, you+x1@…, as Member
    When I press "Accept invitation" in the email
    Then I reach "Set your password": "Choose a password to complete your account setup."
    When I set a password of at least 10 characters, with letters and digits
    Then I land on the "S-Alpha" dashboard, and the owner's Team list shows me as "Member" of "2 members"
    And the same link, opened again in a signed-out window, opens the "Welcome back" sign-in dialog

  @negative
  Scenario Outline: 8.3 · The invite form stops a bad address before anything is sent
    Given I am the agency owner of "S-Alpha", on Settings → Team
    When I <action>
    Then <what I see>
    And no invite email goes out

    Examples:
      | action                                       | what I see                         |
      | type not-an-email and press "Send invite"    | "Enter a valid email" under Email  |
      | clear the Email field                        | "Send invite" cannot be pressed    |
      | type three spaces in Email and press Enter   | "Email is required" under Email    |

  @negative
  Scenario Outline: 8.4 · Someone already on my team is not invited again
    Given I am the agency owner of "S-Alpha", and you+x1@… is my teammate
    When I invite <address>, as <role>
    Then a red toast reads "This email is already a team member"
    And the address stays in the field, and no email goes out

    Examples:
      | address                                       | role   |
      | YOU+X1@… in capitals with spaces around it    | Member |
      | my own address                                | Admin  |

  @edge
  Scenario: 8.5 · A double click sends one invite; a resend as Admin makes my colleague an admin
    Given I am the agency owner of "S-Alpha", on Settings → Team
    When I double-click "Send invite" for you+x2@… as Member
    Then exactly one "Invite sent to you+x2@…" toast shows, and exactly one email arrives
    When I invite you+x2@… again as Admin, and my colleague opens the older email's link
    Then it opens the "Welcome back" sign-in dialog, not "Set your password"
    And the newest email's link, after a password, lists them as "Admin" in my Team list

  @core @negative
  Scenario Outline: 8.6 · Someone who already has a Kontuur account cannot be invited
    Given I am the agency owner of "S-Alpha", and you+x1@… is my teammate
    When <address> is invited as Member by <inviter>
    Then a red toast reads "This email already has an account. They cannot be invited again."
    And no invite email goes out

    Examples:
      | address                 | inviter                 |
      | the owner of "S-Beta"   | me                      |
      | you+x1@…                | the owner of "S-Beta"   |

  @core @negative
  Scenario: 8.7 · An address another agency has just invited is not mine to invite
    Given I am the agency owner of "S-Alpha"
    And the owner of "S-Beta" has just invited you+x3@… as Member
    When I invite you+x3@… as Member
    Then a red toast reads "This email has a pending invite to another workspace."
    And you+x3@… has only S-Beta's email: "S-Beta has added you to their workspace on Kontuur."

  @edge @write
  Scenario: 8.8 · Another agency's invite holds the address for a week, then lets go
    Given I am the agency owner of "S-Alpha", and "S-Beta" invited you+x3@… 6 days 23 hours ago
    When I invite you+x3@… as Member
    Then a red toast reads "This email has a pending invite to another workspace."
    When S-Beta's invite is over 7 days old, and I invite you+x3@… again
    Then the toast reads "Invite sent to you+x3@…"
    And S-Beta's old link opens "Welcome back", and its owner's new invite gets that same red toast

  @edge @write
  Scenario: 8.9 · My own week-old invite can be sent again, and holds the address for another week
    Given I am the agency owner of "S-Alpha", and my invite to you+x11@… was sent 8 days ago, never opened
    When I invite you+x11@… again
    Then the toast reads "Invite sent to you+x11@…"
    When the owner of "S-Beta" invites you+x11@… next
    Then the owner of "S-Beta" sees a red toast: "This email has a pending invite to another workspace."

  @edge
  Scenario: 8.10 · A stranger's unconfirmed sign-up with my colleague's address does not block my invite
    Given I am the agency owner of "S-Alpha", and someone signed up as you+x4@… without confirming
    When I invite you+x4@… as Member
    Then the toast reads "Invite sent to you+x4@…"
    And that sign-up's confirmation link signs no one in, and its password is refused at sign-in
    When my colleague opens my invite email's link and sets a password
    Then they land on the "S-Alpha" dashboard

  @edge
  Scenario: 8.11 · I am a member as soon as I open the invite, even if I leave before choosing a password
    Given the owner of "S-Alpha" invited me, you+x5@…, as Member
    When I open the invite link and close the window on "Set your password" without choosing one
    Then the owner's Team list already shows me as "Member"
    And the owner's second invite to me is refused: "This email is already a team member"
    When I use "Forgot your password?" for you+x5@… and follow the reset email's link
    Then it leads me through "Set your password" to the "S-Alpha" dashboard

  @edge
  Scenario: 8.12 · An invite link over a day old has expired, and a fresh invite brings my colleague in
    Given I am the agency owner of "S-Alpha", and I invited you+x12@… over a day ago
    When my colleague opens that invite link for the first time
    Then it opens the "Welcome back" sign-in dialog
    And a reset link asked for under "Forgot your password?" never arrives
    When I invite you+x12@… again, and my colleague opens the newest link and sets a password
    Then they land on the "S-Alpha" dashboard

  @edge
  Scenario: 8.13 · Opening a colleague's invite link in my own browser signs me out of that window
    Given I am the agency owner of "S-Alpha", signed in, and I invited you+x18@… as Member
    When I open you+x18@…'s invite link in a new tab of my own window and set a password
    Then my first tab, reloaded, is you+x18@…'s: their row is marked "You", with no invite form or Remove
    When I sign out and sign back in as myself
    Then I am still the admin, with the "Admin" pill on my row

  @core @negative
  Scenario: 8.14 · As a teammate I see who is on the team, but I cannot invite or remove anyone
    Given I am a teammate (Member) in "S-Alpha"
    When I open Settings
    Then it opens on Team and lists every member, my own row marked "You"
    But there is no "Invite a team member" section and no Remove button on any row
    And the "Roles" box says a Member has "clients, drafts and review only."

  @core @negative
  Scenario: 8.15 · As a teammate I cannot change the workspace or its plan
    Given I am a teammate (Member) in "S-Alpha", which is on its trial
    When I open Settings → Account
    Then "Agency name" and "Timezone" are greyed out, so I cannot change them
    And I see the "Plan & billing" panel, but no "Choose plan" button
    And the side panel has no "Danger zone", so I cannot delete the workspace
    And the pages Checkout sends admins back to show me no "Payment received" card and no cancel toast

  @edge @write
  Scenario: 8.16 · A teammate who joins a paused workspace meets the pause, and only I can lift it
    Given I am the agency owner of "S-Beta", whose trial ended 8 days ago, so my workspace is paused
    When I invite you+x19@… as Member from Settings → Team
    Then the toast reads "Invite sent to you+x19@…"
    When my colleague accepts the invite and sets a password
    Then they land on the "Workspace paused" card, with a "Choose a plan" link
    And that link opens "Plan & billing" for them, with no "Choose plan" button

  @positive
  Scenario: 8.17 · New invites carry my workspace's new name, while a resend keeps the name it began with
    Given I am the agency owner of "S-Alpha", with an invite to you+x6@… sent before any rename
    When I rename the workspace "S-Alpha Renamed" on Settings → Account and press "Save changes"
    Then the toast reads "Workspace updated"
    When I invite you+x7@…, and send you+x6@…'s invite again
    Then you+x7@…'s email reads "S-Alpha Renamed has added you to their workspace on Kontuur."
    And you+x6@…'s newest email still reads "S-Alpha has added you to their workspace on Kontuur."

  @negative
  Scenario: 8.18 · My workspace cannot be saved without a name
    Given I am the agency owner of "S-Alpha", on Settings → Account
    When I clear "Agency name" and press "Save changes"
    Then a red toast reads "Agency name is required"
    And after "Discard", the name is back as it was

  @core @positive
  Scenario: 8.19 · Removing a teammate deletes their account and frees their address
    Given I am the agency owner of "S-Alpha", and you+x1@… is my teammate
    When I press Remove on their row
    Then a "Remove team member" dialog says their account will be deleted and this cannot be undone
    When I press "Remove permanently"
    Then the toast reads "you+x1@… removed from the workspace", and they leave the list
    And they can no longer sign in, and a new invite to them reads "Invite sent to you+x1@…"

  @edge
  Scenario: 8.20 · A teammate I removed sees nothing more of my workspace in their open window
    Given I am the agency owner of "S-Alpha", and my teammate you+x1@… has it open in their own window
    When I remove them, and they reload that window
    Then no page of "S-Alpha" shows there

  @negative
  Scenario: 8.21 · A removal happens once, even from a double click or a second tab
    Given I am the agency owner of "S-Alpha", and my teammate you+x3@… is listed in two of my tabs
    When I press Remove on them in the first tab and double-click "Remove permanently"
    Then exactly one toast reads "you+x3@… removed from the workspace"
    When I remove them again in the second tab, without reloading it
    Then a red toast reads "Member not found", and the dialog stays open
    And after a reload, the list is one member shorter

  @edge
  Scenario: 8.22 · A co-admin I just removed cannot start a checkout from their still-open window
    Given I am the agency owner of "S-Alpha", on its trial, and my co-admin has Plan & billing open
    When I remove my co-admin, and their very next click in that window is "Choose plan"
    Then they see a red toast: "User not found" or "Only admins can manage the plan."
    And no Stripe Checkout page opens for my workspace

  @edge
  Scenario Outline: 8.23 · A co-admin I removed cannot use the admin controls still open in their window
    Given I am the agency owner of "S-Alpha", and I removed my co-admin while their Settings stayed open
    When they <act> in that window, without reloading
    Then a red toast reads "User not found" or "<refusal>"
    And <result>

    Examples:
      | act                      | refusal                                 | result                     |
      | invite you+x16@…         | Only admins can invite team members     | you+x16@… gets no email    |
      | remove you+x5@…          | Only admins can remove team members     | you+x5@… is still listed   |
      | rename the workspace     | Only admins can update account settings | the name is unchanged      |
      | delete the workspace     | Only admins can delete the workspace.   | the workspace still exists |

  @edge
  Scenario: 8.24 · An invite still works after the admin who sent it has been removed
    Given I am the agency owner of "S-Alpha"
    And my co-admin invited you+x10@…, and I removed my co-admin before the invite was opened
    When my colleague accepts the invite and sets a password
    Then they land on the "S-Alpha" dashboard
    And my Team list shows them as "Member"

  @core @positive
  Scenario: 8.25 · Deleting my workspace ends its unopened invites and frees their addresses
    Given I am the agency owner of "S-Gamma", on its trial, with an unopened invite to you+x8@…
    When I press "Delete workspace", type "S-Gamma" and press "Delete permanently"
    Then I see "Your workspace is gone"
    And the invite email's link now opens the "Welcome back" sign-in dialog
    And the owner of "S-Alpha" can invite you+x8@… and sees "Invite sent to you+x8@…"

  @edge @defect-D19
  Scenario: 8.26 · My solo workspace has no team, and takes no teammate by any other way
    # fails today: an invite sent without the Team tab goes out, and the invitee can join my workspace
    Given I am the business owner of the solo workspace "S-Solo"
    When I open Settings, and also type in the address an agency's Team tab has
    Then Account opens, there is no Team tab, and the header reads "Solo workspace"
    When I try to invite you+x13@… anyway, with a request I type into my browser's developer tools
    Then the invite is refused
    And you+x13@… receives no email
