# 9 · Letting Kontuur read my client's website: setup and coverage

Technical source: `technical/11-capture-guard.feature` (IDs K1–K35), with the long cases in
the detailed K cases. Defects: D15 (9.3, 9.18), D16 (9.8, 9.9). D17 has no customer scenario; see the
last section.

## Covers

- 9.1 ← K1 (the screen half)
- 9.2 ← K3
- 9.3 ← K4 (rows 2 and 3) (D15)
- 9.4 ← K11 (the screen half)
- 9.5 ← K20, plus the follow-up re-analyse K20 names as the way to measure afterwards (K2's journey)
- 9.6 ← K30
- 9.7 ← K2, K8 (the control row: a redirect to kontuur.app), K9 (step 3, the restore)
- 9.8 ← K5, K6 (six of its values), K8 (rows 2 and 3) (D16)
- 9.9 ← K6 (the name that does not exist, detailed case K7 step 4), K9 (steps 1 and 2) (D16)
- 9.10 ← K35
- 9.11 ← K14
- 9.12 ← K33
- 9.13 ← K34
- 9.14 ← K16 (the window reopening), K17, K18
- 9.15 ← K19 (the member half)
- 9.16 ← K15 (its two refusals; its closed new-client page is left to the technical suite, below)
- 9.17 ← K31
- 9.18 ← D15 (Brand profile half)

## Setup

- (every scenario) Kontuur allows 20 website reads, colour captures and re-analyses per person per minute:
  leave 60 s between scenarios and about 5 s between example rows; after an unexpected "Too many
  requests. Please wait a moment." toast, wait 60 s and retry (detailed K setup)
- (every settings scenario) after every Re-analyse website, reload the page and confirm the browser's
  "Leave site?" before changing anything: a later Save changes would store the colours again as hand-set
  (detailed K setup; K2)
- "the default colours" → surface #FFFFFF, ink #1A1A1A, accent #2563EB, accent-deep #1E3A8A, line #E5E5E5
  (technical Background)
- "W-A", "K test client", "a teammate (member) of W-A" → technical Background: W-A is an agency workspace,
  trial or active, with me as admin and one member, each signed in on their own browser profile; K test
  client is a throwaway client whose Website is a real public business site (detailed K setup)
- "W-T", "K15 client" → a separate agency workspace with no Stripe subscription; K15 client has a public
  website and was measured once with Re-analyse website (K15 Before)
- "http://info.cern.ch/hypertext/WWW/TheProject.html" (9.2) → open it in your own browser first: plain
  black text and blue links; if it has been restyled, use any unstyled public page (K3 Before)
- the addresses in 9.3 and 9.18 → only these two; never aim "Read the site →" or "Re-read website" at
  other internal addresses, since the site read has no address check today (detailed K setup, D15).
  `dig +short 10.0.0.1.nip.io` should print 10.0.0.1, else use 10.0.0.1.sslip.io (technical K6 Given)
- "K test client's Website is saved as <address>" (9.18) → Basic info → Website = the row's address →
  Save changes; after the row, put the real site back in Website and Save changes (detailed K setup)
- "colours I set by hand" (9.7, 9.10) → Visual identity → Brand palette → change one swatch to a colour the
  site does not use → Save changes → reload. The save bar appears only when the re-analysed colours differ
  from those on screen (K2: an identical identity leaves the bar hidden)
- the httpbin.org rows (9.7, 9.8) → httpbin.org/redirect-to?url=https://kontuur.app/ must end on
  kontuur.app in your own browser; if httpbin is down, wait and retry (K8 Before)
- "K test client shows colours measured from its real website" (9.8, 9.9) → in the app: Basic info →
  Website = its real site → Save changes → Visual identity → Re-analyse website → reload (K9 step 3).
  Today every example row replaces the colours with the defaults, so repeat this before each row
- "on its trial, with room for another client" (9.5) → W-A only while it is on its trial with fewer than 3
  clients, else a separate trial workspace with room (K20: "room under its client cap"). The save never
  touches the bill on any plan, but a paid W-A refuses it once every client slot is in use. Fill whatever
  the save bar names as missing before pressing "Save client →"; delete the client afterwards (K20
  Before, step 5)
- "a spare client whose Website is example.com:81" (9.13) → in W-T: Add client → "Set them up by hand" →
  a name and whatever the save bar asks for → "Save client →"; then Basic info → Website = example.com:81
  → Save changes. W-T, as K34 Before names it (deleting a client never changes the bill, on any plan)
- "I have used up my 20 website reads for this minute" (9.14) → in DevTools Console on kontuur.app:

  ```js
  const url = '/api/clients/00000000-0000-0000-0000-000000000000/visual-identity/reanalyze'
  const codes = []
  for (let i = 1; i <= 20; i++) codes.push((await fetch(url, { method: 'POST' })).status)
  console.log(codes.join(' '))
  ```

  (twenty 404s; K17 step 1), or the same with `brand-profile/reanalyze` for the Re-read row (K18 step 1);
  then press the button within the same minute. The limit is kept per server instance: if the press passes,
  rerun once, then record it as that documented limit, not a failure (K16)
- "the agency owner has just used up their 20 website reads" (9.15) → as the admin, in Console:

  ```js
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  const codes = []
  for (let i = 1; i <= 20; i++) codes.push((await fetch('/api/extract/start', init)).status)
  console.log(codes.join(' '))
  ```

  (twenty 400s; K19 step 1)
- "my trial ended yesterday" (9.16) → WRITE, test workspace only: `update agencies set trial_ends_at =
  now() - interval '1 day' where id = :agency_id and stripe_subscription_id is null;` then wait 60 s, since
  the workspace is cached for 60 s (K15 Before). Run 9.16 and 9.17 between two billing-cron runs, not across
  08:00 UTC, so no trial reminder goes out (detailed K setup)
- "my trial ends in 3 minutes" (9.17) → WRITE, test workspace only: `update agencies set trial_ends_at =
  now() + interval '3 minutes' where id = :agency_id and stripe_subscription_id is null;` wait 60 s and
  reload (K31 step 1)
- "my trial has ended" (9.17) → run K31's read-only select until `seconds_left` is below 0, then press at
  once (K31 step 3). Afterwards restore: `update agencies set trial_ends_at = now() + interval '14 days'
  where id = :agency_id and stripe_subscription_id is null;` and wait 60 s (K32 step 5)

## Left to the technical suite

- K10 · the colour-capture start called directly with a private, blank, malformed or over-long address,
  and bad session ids: route answers only; the app's own fields never send these
- K12 · another workspace calling W-A's re-read routes and the status route, and signed-out calls: route
  answers (404, 401) that only a console or curl sees
- K13 (D17) · a setup session id borrowed from another agency: the takeover shows only in the database and
  in a console call to the status route. The owner's own sheet notices only when the other agency's last
  write lands after hers and between two of her polls, a race no tester can arrange, so a customer
  scenario could not fail on it reliably
- K27, K28, K29 · the private-address rule at its exact block edges, in IPv6 spellings (with the two known
  gaps), and in disguises (a user name before the host, capitals, a trailing dot, a port, 0, hex): all
  reached through the start route in the console, and each ends, for a customer, the way 9.8 does
- The parts of covered IDs that only a log, the Network tab or the database can see: every
  "[capture:egress]" log line (K1, K3–K9, K35); Haiku call counts and metered usage (K1–K3, K5–K8, K11,
  K17, K18, K30, K33–K35); extraction and identity rows with their source and reason (all); response codes
  and bodies (K5, K6, K8, K15's start call, K16's twenty 400s then a 429), and the status codes of the
  answers whose words the toast shows (K14's 400, K15's 402s, K17's and K18's 429s, K34's 500); K11's
  request counts
- K6's other values (0xa9fea9fe, 0251.0376.0251.0376, 169.254.43518, [64:ff9b::a9fe:a9fe], [fe80::1],
  [fd00::1], 192.168.1.1.nip.io) and K8's localtest.me hop: the same customer outcome as 9.8's rows; they
  stay in the technical outlines
- K16's boundary (the 20th call passes, the 21st is refused): console-only
- K19's admin half (whether the admin's own presses are refused): depends on which server instance
  answers; the technical suite records which
- K4's `localhost` row: refused at once already today (nothing answers, so there is no wait), the outcome
  9.3 describes; it would pass inside the @defect-D15 outline, so it stays in the technical outline. For
  the same reason 9.18 leaves `localhost` out
- K32 · for the customer, the pause is 1.16 (row 2), 1.17 and 1.20 (row 2); the re-read routes' paused
  402 is reached only from the console, since a paused workspace's client pages show the wall
- K15's closed new-client page (step 3: in the trial's grace, typing the new-client address lands on Plan &
  billing) · no customer scenario covers the grace's Add client, since 3-client-slots.feature does not keep
  it: technical 01's T25 row "A1 opens /clients/new" carries it, and Q28 (technical 03-client-slots) the
  disabled Add client. Once paused, the same redirect is 1.20 (row 2)

Detailed cases that the technical file does not carry, also not covered here:

- K7 · merged into the technical K6; its missing-name row is 9.9, its private names are in 9.8
- K21–K24 · DNS rebinding, a name with one private address among public ones, the proxy failing to start,
  unusual upstream answers and WebRTC: unit tests only
- K25 · a failed extraction write: unit tests only
- K26 · the sheet's 90 s give-up ("Reading the colours took too long. These are defaults — adjust anything
  below."): cannot be forced by hand, and no unit test covers it
