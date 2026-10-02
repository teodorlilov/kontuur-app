Feature: Letting Kontuur read my client's website
  As the agency owner, or a teammate, setting up a client and looking after it
  I want Kontuur to read the client's website when I add the client, and again later from its settings
  So that setup is quick, and an address it cannot read fails plainly and never costs me my colours

  @core @positive
  Scenario: 9.1 · Kontuur reads my client's website, drafts the profile and fills in the site's own colours
    Given I am the agency owner of "W-A", on Clients
    When I press "Add client", type my client's public website and press "Read the site →"
    Then the draft profile opens, filled in from the site; under the client's name it reads "Read ‹host› ·"
    And the "Brand palette" row shows grey swatches and "reading the site’s colours…"
    And within about 40 s the site's own colours replace them, marked "the site's own colours"
    And no error page, and no toast about the colours, appears

  @edge
  Scenario: 9.2 · A plain page with no colours of its own gets the default colours, marked as defaults
    Given I am the agency owner of "W-A", on Add client
    When I type "http://info.cern.ch/hypertext/WWW/TheProject.html" and press "Read the site →"
    Then the profile is drafted, and the "Brand palette" row settles on the default colours
    And the row is marked "defaults, not read from the site", in amber
    And pressing Edit on it shows "No colours could be read from the site. These are defaults — adjust below."
    And no error page, and no toast about the colours, appears

  @core @negative @defect-D15
  Scenario Outline: 9.3 · An address that is not a public website is refused at once; I set up by hand
    # fails today: Kontuur's server still fetches it, so an address that never answers keeps me waiting ~25 s
    Given I am the agency owner of "W-A", on Add client
    When I type "<address>" and press "Read the site →"
    Then within a few seconds a red toast reads "Could not read that site — fill the profile in by hand"
    And the blank form opens, reading "Nothing to read — fill this in yourself."
    And nothing on it was drafted from that address, and "Brand palette" shows the default colours to edit

    Examples:
      | address         | what it is                                               |
      | 169.254.169.254 | a cloud server's private internal address                |
      | 10.0.0.1.nip.io | a public-looking name that points into a private network |

  @edge
  Scenario: 9.4 · Enter pressed three times, and a second tab at once: each tab gets its own site's colours
    Given I am the agency owner of "W-A", with Add client open in two tabs
    When in tab 1 I type a public website and press Enter three times quickly
    And at once in tab 2 I type a different public website and press "Read the site →"
    Then each tab ends on its own site's colours, marked "the site's own colours"
    And neither tab ever shows the other site's colours, and neither shows an error

  @edge
  Scenario: 9.5 · If I save before the colours arrive, my client keeps the default colours until I re-analyse
    Given I am the agency owner of "W-A", on its trial, with room for another client
    When I read a public website at Add client
    And I press "Save client →" while its palette still reads "reading the site’s colours…"
    Then I see "Client saved"
    And a minute later the new client's Visual identity still shows the default colours
    And pressing "Re-analyse website" there brings in the site's own colours

  @negative
  Scenario: 9.6 · As a teammate I can read a website at Add client, but only an admin can save the client
    Given I am a teammate (member) of "W-A", and Clients greys out "Add client" for me
    When I open kontuur.app/clients/new by its address, type a public website, press "Read the site →"
    Then the profile is drafted, and "Brand palette" reaches "the site's own colours"
    When I press "Save client →"
    Then a red toast reads "Only admins can add or delete clients.", and the draft stays open
    And after I leave the draft, W-A's Clients list has no new client

  @core @positive
  Scenario Outline: 9.7 · Re-analyse website measures the website saved for my client
    Given I am the agency owner of "W-A", and "K test client"'s Website is saved as <website>
    And its Visual identity shows colours I set by hand
    When I press "Re-analyse website" on its Visual identity tab
    Then it spins, then I see "Visual identity refreshed from website" and the colours of the site it ends on
    And the save bar reads "Unsaved changes · Visual identity", although the colours are already stored
    And after a reload, which the browser asks me to confirm, the same colours show and no save bar

    Examples:
      | website                                          | what it is                          |
      | its real public website                          | the client's own site               |
      | httpbin.org/redirect-to?url=https://kontuur.app/ | a page that forwards to kontuur.app |

  @core @negative @defect-D16
  Scenario Outline: 9.8 · Re-analyse refuses an address that is not a public website, and keeps my colours
    # fails today: it says "Visual identity refreshed from website" and swaps my colours for the defaults
    Given I am the agency owner of "W-A", and "K test client" shows colours measured from its real website
    When I save its Website as "<address>" in Basic info, and press "Re-analyse website"
    Then within seconds a red toast says the site could not be read, and nothing says "refreshed"
    And the swatches still show the colours measured from its real website, after a reload too

    Examples:
      | address                                                              | what it is                  |
      | localhost                                                            | the server's own machine    |
      | 169.254.169.254/latest/meta-data/                                    | a cloud's internal address  |
      | 2852039166                                                           | that address as one number  |
      | [::ffff:169.254.169.254]                                             | that address, IPv6 style    |
      | [::1]                                                                | the server itself, IPv6     |
      | 10.0.0.1.nip.io                                                      | a public name for 10.0.0.1  |
      | localtest.me                                                         | a public name for 127.0.0.1 |
      | httpbin.org/redirect-to?url=http://169.254.169.254/latest/meta-data/ | a page that forwards there  |
      | httpbin.org/redirect-to?url=https://127.0.0.1/                       | a page that forwards inside |

  @core @edge @defect-D16
  Scenario Outline: 9.9 · A mistyped or silent website fails plainly, never hangs, and my colours stay
    # fails today: it says "Visual identity refreshed from website" and swaps my colours for the defaults
    Given I am the agency owner of "W-A", and "K test client" shows colours measured from its real website
    When I save its Website as "<address>" in Basic info, and press "Re-analyse website"
    Then <when> the spinner stops and a red toast says the site could not be read, not "refreshed"
    And the swatches still show the colours measured from its real website, after a reload too

    Examples:
      | address                     | what it is                               | when                  |
      | kontuur-k7-no-such-site.com | a name that does not exist               | within seconds        |
      | example.com:81              | a real site on a port that never answers | within about a minute |
      | kontuur.app:25              | a port browsers refuse to use            | within seconds        |

  @edge
  Scenario: 9.10 · An address I typed but did not save is not what Re-analyse website reads
    Given I am the agency owner of "W-A", and "K test client" has its real website and colours I set by hand
    When I change Website to "169.254.169.254" without saving, and press "Re-analyse website"
    Then I see "Visual identity refreshed from website", with its real site's own colours
    And the save bar reads "Unsaved changes · 2 sections"
    And Brand profile's Source box reads "Reads ‹host› — the edited address applies once you save."
    And after "Discard" and a reload, Website shows its real website again

  @negative
  Scenario: 9.11 · With no website on file, Re-analyse website fails plainly and changes nothing
    Given I am the agency owner of "W-A", and I have cleared "K test client"'s Website and saved
    When I press "Re-analyse website" on its Visual identity tab
    Then a red toast reads "No website on file for this client", and the colours stay
    And on Brand profile, "Re-read website" is greyed out, with a note to add a website on Basic info
    And once I put the website back and save, the colours are still the ones from before

  @edge
  Scenario: 9.12 · A double click sends one re-analyse, and two tabs at once end on the same colours
    Given I am the agency owner of "W-A", with "K test client"'s Visual identity open in two tabs
    When I double-click "Re-analyse website" in tab 1
    Then it spins and cannot be pressed again, and one "Visual identity refreshed from website" shows
    When I reload both, press "Re-analyse website" in tab 1, and within a second in tab 2
    Then both show "Visual identity refreshed from website", with no error
    And after a reload, both tabs show the same colours

  @edge
  Scenario: 9.13 · Deleting a client while its re-analyse runs ends in a plain failure, and it stays deleted
    Given I am the agency owner of "W-T", on its trial, with a spare client whose Website is "example.com:81"
    When I press "Re-analyse website" on it in tab 1, and within 10 s delete it in tab 2
    Then tab 2 shows "‹name› deleted" and my Clients list
    And tab 1 ends on a red toast with the database's error, naming brand_visual_identity_client_id_fkey
    And after a reload, the client is still gone from Clients

  @negative
  Scenario Outline: 9.14 · After 20 website reads in a minute, the next fails plainly and works a minute later
    Given I am the agency owner of "W-A", and I have used up my 20 website reads for this minute
    When I press "<button>" on "K test client"'s <tab> tab
    Then a red toast reads "Too many requests. Please wait a moment.", and nothing on the tab changes
    When a minute has passed and I press "<button>" again
    Then it reads the website as usual, with no red toast

    Examples:
      | button             | tab             |
      | Re-analyse website | Visual identity |
      | Re-read website    | Brand profile   |

  @edge
  Scenario: 9.15 · My website reads are never held back by the agency owner's
    Given I am a teammate (member) of "W-A", on "K test client"'s Visual identity tab
    And the agency owner has just used up their 20 website reads for this minute
    When I press "Re-analyse website" within that minute
    Then I see "Visual identity refreshed from website", with the site's own colours

  @core @negative @write
  Scenario Outline: 9.16 · After my trial ends, reading my client's website again is refused
    Given I am the agency owner of "W-T", my trial ended yesterday, and "K15 client" has measured colours
    When I press "<button>" on K15 client's <tab> tab
    Then a red toast reads "Your trial ended on ‹date›. Scheduled posts still go out until ‹date + 7›;"
    And it ends "choose a plan to keep generating.", as the banner does, and nothing on the tab changes

    Examples:
      | button             | tab             |
      | Re-analyse website | Visual identity |
      | Re-read website    | Brand profile   |

  @edge @write
  Scenario: 9.17 · A re-analyse works in my trial's last minutes, and is refused the moment the trial ends
    Given I am the agency owner of "W-T", and my trial ends in 3 minutes
    When I press "Re-analyse website" on "K15 client"
    Then I see "Visual identity refreshed from website"
    When my trial has ended and I press "Re-analyse website" again at once
    Then a red toast reads "Your trial ended on ‹today›. …", and the colours stay

  @negative @defect-D15
  Scenario Outline: 9.18 · Re-read website refuses a saved address that is not a public website, at once
    # fails today: Kontuur's server still fetches it, so an address that never answers keeps me waiting ~25 s
    Given I am the agency owner of "W-A", and "K test client"'s Website is saved as "<address>"
    When I press "Re-read website" on its Brand profile tab
    Then within a few seconds a red toast reads "Could not read that website"
    And no suggestions open, and the Brand profile is as it was

    Examples:
      | address         | what it is                                               |
      | 169.254.169.254 | a cloud server's private internal address                |
      | 10.0.0.1.nip.io | a public-looking name that points into a private network |
