Feature: The website capture guard
  Site colour reads reach only public addresses and fall back quietly to the default palette.
  Wait 60 s between scenarios: 20 site reads per person per minute. Stripe is never involved.

  # sql: Haiku calls = sum(calls) in ai_usage_daily, flow 'onboarding', model 'claude-haiku-4-5', today
  # sql: identity row = brand_visual_identity by client_id; extraction rows = brand_kit_extractions

  Background:
    Given W-A: me as admin, a member, and "K test client" with a real public website
    And "re-analyse with Website = X" means: save X in Basic info, press Re-analyse website, reload
    And egress lines are in Vercel → Logs, search "capture:egress"
    And the default swatches are #FFFFFF, #1A1A1A, accent #2563EB, #1E3A8A, #E5E5E5

  @positive @core
  Scenario: K1 · Onboarding reads a public site's colours through the egress proxy
    Given W-A signed in, with its extraction rows and Haiku calls noted
    When I open /clients/new, type a public site and press Read the site
    Then within 40 s the palette row shows "the site's own colours", with no error
    And after Cancel → Leave a new extraction row is ready, source "website", non-default palette
    And Haiku calls rose by 2, and metered usage is unchanged
    And there is no "[capture:egress] refused" line

  @positive
  Scenario: K2 · Re-analyse website in settings measures the stored public site
    Given K test client with its public website saved, on its Visual identity tab
    When I press Re-analyse website
    Then the toast reads "Visual identity refreshed from website", with the site's colours
    And the save bar shows "Unsaved changes · Visual identity"
    And after a reload and "Leave site?" the stored palette shows with no save bar
    And the identity row shows source_kind website, updated_at now, and Haiku calls +1

  @edge
  Scenario: K3 · An unstyled plain-http site lands the default palette in onboarding, with no error
    Given http://info.cern.ch/hypertext/WWW/TheProject.html opens as plain text in my browser
    When I type that address, "http://" included, at /clients/new and press Read the site
    Then the palette row ends on the default swatches, "defaults, not read from the site", in amber
    And Edit reads "No colours could be read from the site. These are defaults — adjust below."
    And after Cancel → Leave the extraction row is fallback, "not enough measurable content"
    And Haiku calls +1, with no "[capture:egress] refused" line

  @negative @defect-D15
  Scenario Outline: K4 · A private address typed in onboarding stops at the site read; no capture starts
    Given W-A signed in on /clients/new
    When I type "<address>" and press Read the site
    Then <when> the toast reads "Could not read that site — fill the profile in by hand"
    And the blank form opens with the default swatches, never a drafted profile
    And after Cancel → Leave the newest extraction row is still K3's, with no "[capture:egress]" line

    Examples:
      | address         | when              |
      | localhost       | at once           |
      | 169.254.169.254 | within about 25 s |
      | 10.0.0.1.nip.io | within about 25 s |

  @negative @defect-D16
  Scenario: K5 · Re-analyse on a stored "localhost" is refused at once and wipes the measured palette
    Given K2 left a measured palette
    When I re-analyse with Website = "localhost"
    Then within seconds the toast reads "Visual identity refreshed from website"
    And all five swatches become the defaults
    And the response is 200, reason "not a public address", source_kind default
    And Haiku calls are unchanged, with no "[capture:egress]" line

  @negative @core
  Scenario Outline: K6 · Metadata in every spelling, and private or missing names, are refused
    Given `dig +short 10.0.0.1.nip.io` prints 10.0.0.1, else use 10.0.0.1.sslip.io
    When I re-analyse with Website = "<value>"
    Then within seconds the toast reads "Visual identity refreshed from website"
    And the swatches are the defaults
    And the response is 200, reason "not a public address", website_url "https://<value>"
    And Haiku calls are unchanged, with no "[capture:egress]" line

    Examples:
      | value                             |
      | 169.254.169.254/latest/meta-data/ |
      | 2852039166                        |
      | 0xa9fea9fe                        |
      | 0251.0376.0251.0376               |
      | 169.254.43518                     |
      | [::ffff:169.254.169.254]          |
      | [64:ff9b::a9fe:a9fe]              |
      | [::1]                             |
      | [fe80::1]                         |
      | [fd00::1]                         |
      | 10.0.0.1.nip.io                   |
      | 192.168.1.1.nip.io                |
      | localtest.me                      |
      | kontuur-k7-no-such-site.com       |

  @negative @core
  Scenario Outline: K8 · A public page that redirects to a private address is stopped at the hop
    Given httpbin.org/redirect-to works in my browser
    When I re-analyse with Website = "httpbin.org/redirect-to?url=<target>"
    Then within seconds the toast reads "Visual identity refreshed from website"
    And the identity row shows source_kind <kind>, and Haiku calls are <haiku>
    And Vercel Logs show <log>

    Examples:
      | target                                   | kind    | haiku     | log                               |
      | https://kontuur.app/                     | website | +1        | no refused line                   |
      | http://169.254.169.254/latest/meta-data/ | default | unchanged | refused 169.254.169.254:80, 1-2x  |
      | https://127.0.0.1/                       | default | unchanged | refused 127.0.0.1:443, twice      |
      | http://localtest.me/                     | default | unchanged | refused localtest.me:80, 1-2x     |

  @edge
  Scenario: K9 · A port that never answers or that Chromium refuses ends in defaults, never a hang
    When I re-analyse with Website = "example.com:81"
    Then within a minute the toast reads "Visual identity refreshed from website", with defaults
    When I re-analyse with Website = "kontuur.app:25"
    Then the same toast and defaults come quickly
    And both rows show source_kind default, "navigation failed", and no refused line
    And restoring the real site and re-analysing brings back its colours, source_kind website

  @edge
  Scenario: K10 · The start route answers at once and never errors, whatever it is given
    Given W-A signed in, with the console open
    When I POST each body below to /api/extract/start, and read each status 5 s later
      | session         | websiteUrl                               | start        | status reason        |
      | k10-a           | http://169.254.169.254/latest/meta-data/ | 202 pending  | not a public address |
      | k10-b           | "   " (blank)                            | 202 fallback | no website provided  |
      | k10-c           | javascript:alert(1)                      | 202 pending  | not a public address |
      | k10-f           | ftp://example.com                        | 202 pending  | not a public address |
      | k10-d           | 'http://localhost/?' + 'a'.repeat(2030)  | 202 pending  | not a public address |
      | k10-e           | 'http://localhost/?' + 'a'.repeat(2031)  | 400          | —                    |
      | none: {}        | none                                     | 400          | —                    |
      | 'x'.repeat(201) | none                                     | 400          | —                    |
    Then every answer and status matches its row, the fallbacks carrying the default palette
    And every 400 reads "onboardingSessionId is required", even k10-e's
    And status for "k10-never-started" reads pending, identity null, report null
    And rows k10-a, -b, -c, -d, -f exist; no k10-e, k10-never-started or 201-character row

  @edge
  Scenario: K11 · Enter pressed three times, and a second tab at once: one row per session, no crosstalk
    Given two tabs on /clients/new, tab 1 with Network open
    When in tab 1 I type a public site and press Enter three times quickly
    And at once in tab 2 I read a different public site
    Then each tab ends on its own site's colours, with no error
    And tab 1 sent N analyze-url and N start requests, N up to 3, all with one session id
    And after Cancel → Leave each session has one ready row; Haiku up to 2N for tab 1, +2 for tab 2

  @negative
  Scenario: K12 · Another workspace cannot re-analyse or read W-A's capture; signed-out gets 401
    Given W-B signed in in its own browser profile, with W-A's client id at hand
    When W-B POSTs to W-A's client /visual-identity/reanalyze and /brand-profile/reanalyze
    Then both answer 404 {error: 'Not found'}
    And W-B's /api/extract/status?session=k10-a reads pending, identity null, not W-A's result
    And signed-out POSTs to start, session k12-anon, and W-A's reanalyze get 401 "Unauthorized"
    And W-A's identity is unchanged, and no k12-anon row exists

  @negative @defect-D17
  Scenario: K13 · A session id borrowed from another workspace must not take over its row
    Given k10-a belongs to W-A, and W-B has the console open
    When W-B calls start with session "k10-a" and websiteUrl "https://kontuur.app/"
    Then it is refused
    And 30 s later row k10-a still belongs to W-A, and W-A's status still reads its own fallback
    # sql: select agency_id, status from brand_kit_extractions where onboarding_session_id = 'k10-a';

  @negative
  Scenario: K14 · Re-analyse with no website on file fails plainly and changes nothing
    Given the identity row's updated_at is noted
    When I clear Website in Basic info, save, and press Re-analyse website
    Then the toast reads "No website on file for this client", swatches unchanged
    And the response is 400 {"error":"No website on file for this client"}
    And Brand profile's Re-read website is disabled, while Re-analyse website is not
    And after I restore the website and save, the identity row and Haiku calls are unchanged

  @negative @write
  Scenario: K15 · In the trial's grace every site read, re-read and capture start is refused with 402
    Given W-T, an agency with no subscription, whose "K15 client" was measured once
    And by SQL write on the test workspace, W-T's trial ended 1 day ago
    When I press Re-analyse website, then Re-read website, then call start with session k15-a
    Then both toasts read "Your trial ended on ‹yesterday›. Scheduled posts still go out until …"
    And all three answer 402 with that sentence alone: {"error":"Your trial ended on …"}
    And K15 client's identity and W-T's model calls are unchanged, and there is no k15-a row

  @edge
  Scenario: K16 · The 20th site read in a minute passes, the 21st is refused, the window reopens after 60 s
    Given W-A signed in, nothing in the pool for 60 s
    When I post "{}" to /api/extract/start 21 times in a row from the console
    Then it prints twenty 400s, then one 429
    And a post at about 50 s still answers 429 {error: 'Too many requests. Please wait a moment.'}
    And a post at about 65 s answers 400 {error: 'onboardingSessionId is required'}

  @negative
  Scenario: K17 · Re-analyse website with the pool used up starts no capture and writes nothing
    Given K test client with a measured palette, its updated_at noted
    When I POST 20 times to /api/clients/00000000-0000-0000-0000-000000000000/visual-identity/reanalyze
    And within the same minute press Re-analyse website on K test client
    Then the toast reads "Too many requests. Please wait a moment.", response 429
    And the identity row and Haiku calls are unchanged
    And 60 s later Re-analyse website refreshes it: updated_at now, Haiku calls +1

  @negative
  Scenario: K18 · Brand Re-read website shares the pool and is refused when it is used up
    When I POST 20 times to /api/clients/00000000-0000-0000-0000-000000000000/brand-profile/reanalyze
    And within the same minute press Brand profile's Re-read website on K test client
    Then the toast reads "Too many requests. Please wait a moment.", and no dialog opens
    And the response is 429, and Haiku calls are unchanged

  @edge
  Scenario: K19 · One pool per person across the site-reading routes; another member is not affected
    Given W-A's member signed in on another browser, on K test client's Visual identity tab
    And the admin has just posted "{}" to /api/extract/start 20 times
    When within the minute the admin presses Re-analyse website, and reads a site at /clients/new
    Then each is refused with 429 or passes: record which
    When within the same minute the member presses Re-analyse website
    Then it is never refused: "Visual identity refreshed from website", source_kind website

  @edge
  Scenario: K20 · A palette that lands after the client was saved never rewrites it
    Given a trial workspace with room under its client cap
    When I read a public site at /clients/new and save during "reading the site's colours…"
    Then the toast reads "Client saved"
    And 60 s later the new client's Visual identity shows the default palette
    And its identity is source_kind default, while its extraction row is ready with the site's accent

  @edge
  Scenario Outline: K27 · The private IPv4 blocks stop exactly at their edges
    When I call start with session "k27-<k>" and websiteUrl "https://<ip>/"
    Then it answers 202 pending, and about 3 minutes later its status is fallback, reason <reason>
    And its row has accent #2563EB, with no "[capture:egress] refused" line

    Examples:
      | k | ip              | reason                         |
      | a | 172.15.255.254  | any but "not a public address" |
      | b | 172.16.0.1      | "not a public address"         |
      | c | 172.31.255.254  | "not a public address"         |
      | d | 172.32.0.1      | any but "not a public address" |
      | e | 100.63.255.254  | any but "not a public address" |
      | f | 100.64.0.1      | "not a public address"         |
      | g | 100.127.255.254 | "not a public address"         |
      | h | 100.128.0.1     | any but "not a public address" |
      | i | 223.255.255.254 | any but "not a public address" |
      | j | 224.0.0.1       | "not a public address"         |

  @edge
  Scenario Outline: K28 · IPv6 spellings are judged by the IPv4 they carry; two known gaps are recorded
    When I call start with session "k28-<k>" and websiteUrl "https://<host>/"
    Then it answers 202 pending, and about 3 minutes later status and row are fallback, <reason>

    Examples:
      | k | host                                   | reason                         | note      |
      | a | [::ffff:808:808]                       | any but "not a public address" |           |
      | b | [2002:a00:1::1]                        | "not a public address"         |           |
      | c | [2002:808:808::1]                      | any but "not a public address" |           |
      | d | [64:ff9b::a00:1]                       | "not a public address"         |           |
      | e | [2001:db8::1]                          | "not a public address"         |           |
      | f | [ff02::1]                              | "not a public address"         |           |
      | g | [2001:0:4136:e378:8000:63bf:f5ff:fffe] | any but "not a public address" | known gap |
      | h | 192.0.2.1                              | any but "not a public address" | known gap |

  @negative
  Scenario Outline: K29 · Disguised internal addresses are all refused before any browser opens
    When I call start with session "k29-<k>" and websiteUrl "<url>"
    Then it answers 202 pending, and within 10 s its status is fallback, "not a public address"
    And its row has accent #2563EB
    And there is no "[capture:egress]" line, and Haiku calls are unchanged

    Examples:
      | k | url                                  |
      | a | https://kontuur.app@169.254.169.254/ |
      | b | https://LOCALHOST/                   |
      | c | https://localhost./                  |
      | d | https://127.0.0.1:8080/              |
      | e | https://0/                           |
      | f | https://[::]/                        |
      | g | https://0x7f.1/                      |
      | h | https://127.0.0.1.nip.io/            |

  @negative
  Scenario: K30 · A member can read a site's colours at /clients/new, but the save is refused
    Given W-A's member signed in on their own browser profile
    When the member opens /clients/new by address, types a public site and presses Read the site
    Then the profile is drafted, and the palette row reaches "the site's own colours"
    When the member presses Save client
    Then the toast reads "Only admins can add or delete clients.", and the sheet stays open
    And after Cancel → Leave, W-A has no new client, one new ready extraction row, Haiku calls +2

  @edge @write
  Scenario: K31 · A re-analyse passes in the trial's last minutes and is refused the moment it ends
    Given by SQL write on the test workspace, W-T's trial ends in 3 minutes
    When I press Re-analyse website on K15 client
    Then the toast reads "Visual identity refreshed from website", with updated_at now
    When the trial end has passed and I press Re-analyse website at once
    Then the toast reads "Your trial ended on ‹today›. Scheduled posts still go out until …"
    And the response is 402 with that sentence as its one field, and updated_at is unchanged

  @negative @write
  Scenario: K32 · When the 7-day grace runs out, the trial-ended refusal turns into the paused one
    Given by SQL write on the test workspace, W-T's trial ended 7 days ago less 3 minutes
    When I POST to K15 client's /visual-identity/reanalyze from the console
    Then it answers 402 {"error":"Your trial ended on …"}, with no other field
    When the grace has run out, I repeat it and call start with session "k32-a"
    Then both answer 402 "Your workspace is paused. Choose a plan to generate, schedule and publish again."
    And /clients shows the paused wall, and there is no k32-a row

  @edge
  Scenario: K33 · A double click sends one re-analyse; two tabs at once leave one identity, later answer wins
    Given K test client with its real website, on Visual identity in two tabs, tab 1 with Network open
    When I double-click Re-analyse website in tab 1
    Then exactly one reanalyze request goes out, with one toast
    When I reload both tabs, and press Re-analyse website in tab 1 and within a second in tab 2
    Then both show the toast, and after a reload both show the same stored palette
    And there is one identity row, updated_at the later answer, and Haiku calls rose by 3 in all

  @edge
  Scenario: K34 · A client deleted while its re-analyse runs leaves no identity behind
    Given W-T on its trial with a throwaway client whose Website is "example.com:81"
    When I press Re-analyse website on it in tab 1, and within 10 s delete it in tab 2
    Then tab 2 shows "‹name› deleted"
    And tab 1's toast is the response's own error
    And the response is 500, its error naming brand_visual_identity_client_id_fkey
    And no clients row or identity row exists for the throwaway id, and Haiku calls are unchanged

  @edge
  Scenario: K35 · An unsaved Website edit is not what Re-analyse website reads
    Given K test client with its real website stored
    When I type "169.254.169.254" into Website without saving, and press Re-analyse website
    Then the toast reads "Visual identity refreshed from website" with the site's own colours
    And the save bar reads "Unsaved changes · 2 sections"
    And after Discard and reload, Website and website_url show the real site, source_kind website
    And there is no "[capture:egress]" line for 169.254.169.254
