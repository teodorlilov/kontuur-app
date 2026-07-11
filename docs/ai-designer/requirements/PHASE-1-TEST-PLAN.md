# Phase 1 — E2E Test Plan

> End-to-end verification of the brand system (detect + author) on a real deploy. Complements
> [PHASE-0-TEST-PLAN.md](PHASE-0-TEST-PLAN.md) (the render core) — run that first, since every preview
> here renders through it. Tracks [PHASE-1.md](PHASE-1.md) / [PHASE-1-STATUS.md](PHASE-1-STATUS.md).

Branch under test: **`feat/composition-engine-phase0`**.

---

## 0. Setup (once)

| # | Prerequisite | Confirm |
| --- | --- | --- |
| 1 | **Three migrations applied, in order** | `post_visuals` → `brand_kits`/`feed_systems` → `brand_kit_extractions` all exist |
| 2 | `renders` storage bucket (public) | Phase-0 prerequisite; needed for any render |
| 3 | Env on the deploy | `ANTHROPIC_API_KEY`, `CRON_SECRET`, `RENDER_TOKEN_SECRET`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` |
| 4 | `/api/extract` function memory ≥ 1 GB | it runs Chromium, like `/api/render` |

```bash
export BASE="https://<your-preview>.vercel.app"
export CRON_SECRET="<value>"
```

> **Two things are NOT wired yet — don't hunt for them (they're honest gaps, not bugs):**
> 1. The Visual system tab has **no "Re-analyze from website" / "Upload reference image" buttons** (§3.1
>    lists them; the editor + save shipped, those triggers didn't). Extraction is reachable via
>    onboarding or the direct API only.
> 2. **Onboarding has no image-upload path** — the image extractor (2.2) is testable via the direct API
>    (§5) but no UI sends it an image yet.

---

## 1. Automated baseline (run before deploying)

| ID | Command | Passes when |
| --- | --- | --- |
| A-1 | `npm run test` | 376 tests green (incl. tokens-schema, colour clustering, k-means, type-scale, font-filter, component render) |
| A-2 | `npx tsc --noEmit` | exit 0 |
| A-3 | `npm run build` | exit 0; `/api/extract`, `/api/extract/start`, `/api/extract/status` listed |

---

## 2. Data model (SQL — after migrations)

### TC-D1 — Backfill: every client has exactly one kit
```sql
select (select count(*) from clients) as clients, (select count(*) from brand_kits) as kits;
select client_id, count(*) from brand_kits group by client_id having count(*) > 1;  -- expect 0 rows
```
**Expect:** `clients == kits`; the second query returns nothing (unique per client).

### TC-D2 — Feed systems seeded
```sql
select slug, name, photographic, plate_budget from feed_systems order by slug;
```
**Expect:** `bold-blocks` (cover-only, 1), `editorial` (every-third, 3), `quiet-grid` (none, 0).

### TC-D3 — Token validation rejects a broken kit
Via the app: TC-3.x below exercises this. Direct: an update writing `tokens` without `accent` should be
refused by `saveBrandKit` (zod) — see TC-3.4.

---

## 3. Visual system settings tab (§3.1 / §3.3)  ⭐ the main author surface

Open **Clients → pick a client → Edit → Visual system** (the Palette tab).

### TC-3.1 — Loads the client's kit
- **Expect:** five colour swatches (default kit: accent `#2563EB`), Display = Source Serif 4, Body =
  Source Sans 3, and a **3×3 live preview** rendering the reference compositions in those colours.

### TC-3.2 — Instant recolour (no request)  ⭐ the §3.1 done-when
- Open devtools → Network. Change the **accent** colour swatch.
- **Expect:** all nine preview cells recolour **immediately**, and **no network request** fires. Same for
  editing ink/surface/line and moving the scale slider.

### TC-3.3 — Font list is language-filtered
- Open the Display/Body dropdowns.
- **Expect:** the library families are listed. For a Bulgarian or English client the full library shows
  (every curated family covers both scripts). *Note:* exclusion of a Latin-only face is unit-tested but
  not demonstrable in-UI yet — the library has no Latin-only font to exclude.

### TC-3.4 — Save persists + bumps version, rejects invalid
- Change a colour, pick a feed system card, click **Save changes**.
- **Expect:** success toast; redirect to /clients.
```sql
select version, source_kind, tokens->'color'->>'accent' as accent from brand_kits where client_id = '<id>';
select fs.slug from client_feed_systems cfs join feed_systems fs on fs.id = cfs.feed_system_id
  where cfs.client_id = '<id>' and cfs.is_default;
```
- **Expect:** `version` incremented, `source_kind = 'manual'`, `accent` = your new colour, the chosen
  feed-system slug is the default. (Invalid tokens can't be produced via the UI; the zod guard is A-1.)

### TC-3.5 — Propagation note is accurate (§3.3)
- On the tab, read the note at the bottom.
- **Expect:** *"Saving will re-render N drafts automatically. M scheduled posts will ask first. Published
  posts are never changed."* Cross-check:
```sql
select
  count(*) filter (where status in ('draft','pending','pending_review','approved')) as drafts,
  count(*) filter (where status = 'scheduled') as scheduled,
  count(*) filter (where status = 'published') as published
from posts where client_id = '<id>';
```
- N/M must match `drafts`/`scheduled`. A client with no posts shows *"No posts use this visual system yet."*
- **Note:** no re-render actually fires (Phase 7) — the copy states the policy.

---

## 4. Onboarding by URL (§2.3 / §2.4)  ⭐ the flagship detect flow

Go to **/clients/new**. Enter a real website URL (e.g. a clinic/agency site) → **Analyze**.

### TC-4.1 — No perceived wait
- **Expect:** the flow moves to Analyzing → Interview immediately; extraction runs in the background (it
  does **not** block the Continue button). The `/api/extract/start` call returns instantly.

### TC-4.2 — Review shows the Visual system section
- Complete the interview to reach **Review**. Scroll to **Visual system** (sidebar has the Palette item).
- **Expect:** TokenEditor + a live 3×3 preview + the three feed-system cards, one **Recommended — <reason>**.

### TC-4.3 — Real extraction hydrates in place
- If extraction finished, the colours/fonts reflect the **live site** (not the neutral default), badged
  `measured` (colours/fonts) / `inferred` (accent/mood), and a feed system is pre-selected.
- **Expect:** confirm the accent roughly matches the site. Cross-check the row:
```sql
select status, tokens->'color'->>'accent', report->'confidence'
from brand_kit_extractions order by created_at desc limit 1;
```
- `status` should be `ready` (or `fallback` on a blocked site). If you edited a token before it landed,
  your edit is **kept** (the poll never clobbers operator edits — that's by design).

### TC-4.4 — Accept writes the kit
- Click **Confirm & save client**.
- **Expect:** a new client with a brand kit + default feed system:
```sql
select bk.source_kind, bk.tokens->'color'->>'accent',
  (select fs.slug from client_feed_systems cfs join feed_systems fs on fs.id=cfs.feed_system_id
   where cfs.client_id=c.id and cfs.is_default)
from clients c join brand_kits bk on bk.client_id=c.id
order by c.created_at desc limit 1;
```

### TC-4.5 — Skip URL → default kit, still renderable
- Start onboarding, **Skip** the URL, answer manually, save.
- **Expect:** the Review shows the **default kit** (editable), no extraction; the client still saves with
  a renderable kit.

### TC-4.6 — Fail-soft on a bad site
- Onboard with a URL that blocks bots or 404s.
- **Expect:** onboarding **never blocks**; the extraction row ends `fallback`/`failed`, the Review shows
  the default kit, and save succeeds. (Killing the function mid-extract must also leave onboarding
  completable — §2.3 done-when.)

---

## 5. Extraction API — direct (§2.1 / §2.2)

The only way to exercise the **image** path today, and the fastest way to inspect extractor output.

### TC-5.1 — Website extraction
```bash
curl -s -X POST "$BASE/api/extract" -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" -d '{"url":"https://<a-real-site>"}' | jq '{report, color: .tokens.color, display: .tokens.type.display.family}'
```
- **Expect (warm, may be slow cold):** `tokens.color` are real hex values roughly matching the site;
  `report.confidence.colors == "measured"`, `report.feedSystemRecommendation` present; display family is
  a **library** family. Auth: a call without the bearer returns 401.

### TC-5.2 — Image extraction (fonts always `guessed`)
```bash
B64=$(base64 -i some-brand-image.png)
curl -s -X POST "$BASE/api/extract" -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" -d "{\"image\":\"$B64\",\"mediaType\":\"image/png\"}" \
  | jq '{fonts: .report.confidence.fonts, palette: .tokens.color}'
```
- **Expect:** a plausible palette from the image; **`report.confidence.fonts == "guessed"`** (never
  `measured` on the image path — §2.2 done-when).

### TC-5.3 — Bad input degrades, never 500s
```bash
curl -s -X POST "$BASE/api/extract" -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" -d '{"url":"https://not-a-real-domain.invalid"}' | jq '.report.fallback'
```
- **Expect:** 200 with `report.fallback.toDefaultKit == true` and a reason — the default kit, not an error.

---

## 6. Access control

### TC-6.1 — Agency scoping on the status poll
- As agency A, note an `onboarding_session_id`; hitting `GET /api/extract/status?session=<A's id>` as a
  **different** agency's session returns `pending`/empty (never A's tokens).
- **Expect:** no cross-agency leakage. (`getBrandKitForClient` + `saveBrandKit` + the status route all
  verify `agency_id` server-side.)

---

## 7. Sign-off

| TC | Result | Notes |
| --- | --- | --- |
| A-1/A-2/A-3 baseline | ☐ | |
| TC-D1 backfill ⭐ | ☐ | kits == clients? |
| TC-D2 feed systems | ☐ | 3 seeded |
| TC-3.1 tab loads | ☐ | |
| TC-3.2 instant recolour ⭐ | ☐ | no network request? |
| TC-3.3 font list | ☐ | |
| TC-3.4 save + version ⭐ | ☐ | version bumped? |
| TC-3.5 propagation note | ☐ | counts match SQL? |
| TC-4.1 no wait ⭐ | ☐ | |
| TC-4.2 review section | ☐ | |
| TC-4.3 real hydration ⭐ | ☐ | status ready? accent matches? |
| TC-4.4 accept writes kit | ☐ | |
| TC-4.5 skip → default | ☐ | |
| TC-4.6 fail-soft ⭐ | ☐ | onboarding never blocked? |
| TC-5.1 website API | ☐ | cold time: ___ |
| TC-5.2 image API ⭐ | ☐ | fonts == guessed? |
| TC-5.3 bad input | ☐ | fallback, not 500? |
| TC-6.1 agency scoping ⭐ | ☐ | |

**Phase 1 is accepted when** the ⭐ cases pass, TC-D1/D2 confirm the data model, and TC-4 completes a full
onboarding that produces a kit whose colours match the live site. Record TC-4.3 accent vs the real site.
