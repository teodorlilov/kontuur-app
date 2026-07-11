# Phase 0 — Test Plan

> Verifies the render core (tasks 2.0–2.6) against the [PHASE-0.md](PHASE-0.md) "Definition of done".
> Two layers: **automated** (run anywhere) and **deploy verification** (only provable on a Vercel Pro
> deploy, because the Chromium binary is Linux-only). Tracks [PHASE-0-STATUS.md](PHASE-0-STATUS.md).

Branch under test: **`feat/composition-engine-phase0`**.

---

## 0. Environment setup (do once, before deploy verification)

| # | Prerequisite | How to confirm |
| --- | --- | --- |
| 1 | Migration applied | `select * from post_visuals limit 1;` runs without "relation does not exist" |
| 2 | Public **`renders`** storage bucket exists | Visible in Supabase → Storage; public read |
| 3 | Preview env vars set | `RENDER_TOKEN_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` all present on the **Preview** environment |
| 4 | Render function memory ≥ 1 GB | Vercel → Project → Settings → Functions |

Shell variables used throughout:

```bash
export BASE="https://<your-preview-deployment>.vercel.app"   # the branch preview URL
export CRON_SECRET="<the value set in Vercel>"
```

### Seed data

Insert against any existing post (the FK requires a real `posts.id`). Composition **A** — a cover with
a gradient plate + centred headline:

```sql
insert into post_visuals (post_id, slide_index, composition_json, brand_kit_version)
values ((select id from posts limit 1), 0, '{
  "id":"seed-cover","feedSystemId":"test","brandKitVersion":1,
  "size":{"w":1080,"h":1350},
  "layers":[
    {"type":"plate","id":"bg","name":"bg","locked":false,"hidden":false,
     "rect":{"x":0,"y":0,"w":1080,"h":1350,"rotate":0},
     "opacity":{"mode":"literal","value":1},"blendMode":{"mode":"literal","value":"normal"},
     "clip":{"kind":"none"},"source":"generated","editHeadId":null,"src":"",
     "treatment":{"mode":"literal","value":"none"}},
    {"type":"text","id":"h","name":"headline","locked":false,"hidden":false,
     "rect":{"x":90,"y":520,"w":900,"h":320,"rotate":0},
     "opacity":{"mode":"literal","value":1},"blendMode":{"mode":"literal","value":"normal"},
     "clip":{"kind":"none"},"slot":"headline","content":"Rendered by the\ncomposition engine",
     "lang":"en","family":{"mode":"bound","token":"type.display.family"},
     "size":{"mode":"literal","value":96},"weight":{"mode":"literal","value":700},
     "color":{"mode":"bound","token":"color.surface"},"align":{"mode":"literal","value":"center"},
     "autoFit":null}
  ]}'::jsonb, 1)
returning id;
```

Keep the returned id as `$PV`. The other cases are edits of this row (given inline per test).

### Debug aid — mint a render token by hand

`/render/[id]` is token-gated by design, so to open it in a browser (to eyeball a render or debug a
failure) mint a 120-second token. This mirrors `src/lib/render/token.ts` exactly:

```bash
RENDER_TOKEN_SECRET="<value>" node -e '
const c=require("crypto");const pv=process.argv[1];
const p=Buffer.from(JSON.stringify({pv,exp:Date.now()+120000})).toString("base64url");
const s=c.createHmac("sha256",process.env.RENDER_TOKEN_SECRET).update(p).digest("base64url");
console.log(`'"$BASE"'/render/${pv}?token=${p}.${s}`);' "$PV"
```

Open the printed URL within 2 minutes.

---

## 1. Automated tests (regression baseline — run before every deploy)

| ID | Command | Passes when | Covers |
| --- | --- | --- | --- |
| A-1 | `npm run test` | 24 files / 319 tests green | scene-graph validators + `resolve`, render token, google-fonts, **render hash** (version bump changes hash), **cache predicate** (`isCacheHit` hit/miss cases) |
| A-2 | `npx tsc --noEmit` | exit 0 | whole tree typechecks |
| A-3 | `npm run build` | exit 0, `/api/render` + `/render/[postVisualId]` listed | the branch actually builds/deploys |

A-1 already proves the **decision logic** for 2.6 (unchanged → hit, edit → miss, version bump → miss)
and the hash correctness for 2.1/2.6. Deploy verification proves the *pixels and the browser*.

---

## 2. Deploy verification

Run in order — TC-03 must succeed before the cache tests (it populates the cache).

### TC-01 — Function boots & rejects unauthorised calls
- **Steps:**
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/render"                       # no auth
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/render" -H "authorization: Bearer wrong"
  curl -s -X POST "$BASE/api/render" -H "authorization: Bearer $CRON_SECRET" \
       -H "content-type: application/json" -d '{}'                                            # no id
  curl -s -X POST "$BASE/api/render" -H "authorization: Bearer $CRON_SECRET" \
       -H "content-type: application/json" -d '{"postVisualId":"00000000-0000-0000-0000-000000000000"}'
  ```
- **Expect:** `401`, `401`, `{"error":"postVisualId required"}` (400), `{"error":"not found"}` (404).
- **DoD:** error contract (§2.5).

### TC-02 — /render page is token-gated
- **Steps:** open `$BASE/render/$PV` with **no** `?token`, then with a garbage token, then with a valid
  minted token (debug aid above).
- **Expect:** 404 (Next not-found) for the first two; the single slide renders for the third.
- **DoD:** §2.3 (token, not session).

### TC-03 — Happy-path render → PNG  ⭐ core
- **Steps:**
  ```bash
  curl -s -X POST "$BASE/api/render" -H "authorization: Bearer $CRON_SECRET" \
    -H "content-type: application/json" -d "{\"postVisualId\":\"$PV\"}" | jq
  ```
- **Expect:** `200` with `{ "url": "...renders/$PV/<hash>.png", "hash": "<64 hex>", "fit": [{"fit":"ok"}] }`.
  Opening `url` shows a 1080×1350 PNG: accent→accent-deep gradient, centred white headline in the
  display font (two lines, `\n` honoured). File exists in the `renders` bucket.
- **DoD:** first line of §0; §2.2 renders; §2.5 upload.
- **Note:** the **first** call is a cold browser launch — may take 10–20 s. Note the time for TC-12.

### TC-04 — Visual correctness (tokens + fonts)
- **Steps:** inspect the PNG from TC-03 (or open the token URL).
- **Expect:** colours are the `DEFAULT_TOKENS` kit (no stray hex); the headline uses the **display
  family**, not a browser default (font actually loaded — `font-display:block` means no fallback flash);
  text is a crisp DOM node, not rasterised/blurred.
- **DoD:** §2.2, §2.3 fonts.

### TC-05 — Blend + clip composite
- **Setup:** point the row at composition **B** (adds a `color.accent-deep` rect with
  `blendMode:multiply` inside a rounded `clip:rect`), then render:
  ```sql
  update post_visuals set composition_json = composition_json
    || jsonb_build_object('layers', (composition_json->'layers') || '[{
      "type":"shape","id":"blend","name":"blend","locked":false,"hidden":false,
      "rect":{"x":140,"y":375,"w":800,"h":600,"rotate":0},
      "opacity":{"mode":"literal","value":1},"blendMode":{"mode":"literal","value":"multiply"},
      "clip":{"kind":"rect","radius":64},"shape":"rect",
      "fill":{"mode":"bound","token":"color.accent-deep"}}]'::jsonb)
    where id = '<PV>';
  ```
- **Expect:** re-render shows a **rounded-corner** rectangle (clip applied) whose overlap with the
  gradient is **darkened** (multiply applied, not a flat opaque block).
- **DoD:** two-plate `mix-blend-mode` + `clip-path` composites correctly (§0, §2.2).

### TC-06 — Cache hit (no Chromium launch)  ⭐ 2.6
- **Precondition:** TC-03 (or TC-05) just ran and stored a render.
- **Steps:** call the same `POST /api/render` again with no changes; time it.
- **Expect:** same `url` and `hash`, `fit` is **`[]`** (the tell-tale of a cache hit — a fresh render
  populates `fit`, the cache path returns empty), and the response is **fast (~tens of ms)** vs the
  seconds a render takes. Vercel function logs show no browser launch.
- **DoD:** unchanged slide serves the stored PNG without re-rendering (§0, §2.6).

### TC-07 — Cache miss on a one-property edit
- **Steps:** change one field, re-render:
  ```sql
  update post_visuals
    set composition_json = jsonb_set(composition_json, '{layers,1,content}', '"Edited headline"')
    where id = '<PV>';
  ```
  `POST /api/render` again.
- **Expect:** a **different** `hash`, a **new** PNG file `renders/$PV/<new-hash>.png`, `fit` repopulated,
  render latency back to seconds. Exactly one re-render.
- **DoD:** a one-property edit forces exactly one re-render (§2.6).

### TC-08 — Cache miss on a brand-kit version bump  ⭐ rebrand guard
- **Steps:** bump only the version (composition unchanged), re-render:
  ```sql
  update post_visuals set brand_kit_version = brand_kit_version + 1 where id = '<PV>';
  ```
  `POST /api/render` again.
- **Expect:** a **different** `hash` and a re-render, **even though the composition JSON is identical.**
  If the hash were unchanged here, a future rebrand would silently reuse stale art — this is the guard.
- **DoD:** a version bump with no composition change forces a re-render (§2.6).

### TC-09 — Dead image URL does not hang
- **Setup:** point the plate at a non-resolving URL:
  ```sql
  update post_visuals
    set composition_json = jsonb_set(composition_json, '{layers,0,src}', '"https://example.invalid/x.jpg"')
    where id = '<PV>';
  ```
  Render.
- **Expect:** a **complete PNG returns within a few seconds** (no 15 s hang) — `<Stage>` swallows the
  failed `decode()` and signals ready anyway.
- **Known gap (report, don't fail on it):** the current `PlateView` only draws the token gradient when
  `src` is **empty** — a *failed* URL renders an empty/broken image box, **not** a gradient fallback.
  The error-contract's "falls back to its token gradient" row is **not implemented** in Phase 0. The
  guarantee that *does* hold is "returns a complete PNG, not a hang."

### TC-10 — Render timeout → 504  *(optional / best-effort)*
- Hard to force deterministically (`<Stage>` always sets `__stageReady` in a `finally`). To exercise the
  path, temporarily lower `STAGE_READY_TIMEOUT_MS` in `render.ts` and point at a deliberately heavy page,
  or skip. **Expect when forced:** `504 {"error":"render-timeout"}`.
- **DoD:** timeout row of the §2.5 error contract.

### TC-11 — Bulgarian `lang="bg"`  ⚠️ known open risk
- **Setup:** set `lang:"bg"` and Cyrillic content:
  ```sql
  update post_visuals set composition_json =
    jsonb_set(jsonb_set(composition_json,'{layers,1,lang}','"bg"'),
              '{layers,1,content}', '"Заглавие на\nбългарски"')
    where id = '<PV>';
  ```
  Render (or pass `lang=bg` to the page URL).
- **Expect now:** the default kit is **Source Serif 4 / Source Sans 3**, baked with the cyrillic subset
  that carries Bulgarian `locl`, and `<Stage lang="bg">` triggers it. So Bulgarian **should** show the
  localised forms (`г т п` upright, `д л` straight legs). Compare the rendered PNG against the
  bg-column of the specimen page for the same font. If they match → pass; if they look Russian-style →
  the `locl` didn't survive subsetting (re-check `scripts/bake-fonts.mjs` output).
- **DoD:** Bulgarian `lang="bg"` localised letterforms render (§0). This is now a real pass/fail, not
  a deferral.

### TC-13 — autoFit shrink & overflow  ⭐ 2.4
- **Setup (shrink):** give the headline `autoFit` and content too tall for its 320 px box at 96 px:
  ```sql
  update post_visuals set composition_json =
    jsonb_set(jsonb_set(composition_json,'{layers,1,autoFit}','{"min":40,"max":120}'),
      '{layers,1,content}','"A headline long enough\nto need several lines\nand then a few\nmore lines still"')
    where id = '<PV>';
  ```
  Render.
- **Expect (shrink):** the `fit` array contains **`"shrunk:N"`** (N≥1), and in the PNG the headline is
  smaller and sits **within** its box (no lines spilling past it).
- **Setup (overflow):** force impossibility — raise `min` so it cannot shrink enough:
  ```sql
  update post_visuals set composition_json = jsonb_set(composition_json,'{layers,1,autoFit}','{"min":96,"max":120}')
    where id = '<PV>';
  ```
  Render.
- **Expect (overflow):** `fit` contains **`"overflow"`**, and the text is **not clipped** — it visibly
  spills (surfaced for the copy pipeline, never cut off).
- **DoD:** long headline shrinks one step → `shrunk:1`; impossible → `overflow` without clipping (§2.4).

### TC-12 — Carousel latency (warm)
- **Setup:** seed 8 rows (slide_index 0–7) under one post.
- **Steps:** with the browser already warm (right after TC-03), render all 8 sequentially; sum the wall
  time.
- **Expect:** a single **warm** slide < 3 s; 8 slides < 12 s. (Exclude the first cold launch.)
- **DoD:** warm render < 3 s / 8-slide < 12 s (§0).

---

## 3. Not yet testable (task not implemented)

| Item | Why blocked |
| --- | --- |
| **Golden-image snapshots** (2.7) | The in-container snapshot harness and the 4–5 reference fixtures aren't built. TC-04/TC-05/TC-13 are manual eyeballing until then. |
| **Baked Bulgarian-`locl` fonts** | Deferred; TC-11 documents the interim state. |

---

## 4. Sign-off

| TC | Result | Notes |
| --- | --- | --- |
| A-1 automated | ☐ pass | |
| A-2 tsc | ☐ pass | |
| A-3 build | ☐ pass | |
| TC-01 auth/errors | ☐ | |
| TC-02 token gate | ☐ | |
| TC-03 happy path ⭐ | ☐ | cold time: ___ |
| TC-04 tokens/fonts | ☐ | |
| TC-05 blend+clip | ☐ | |
| TC-06 cache hit ⭐ | ☐ | `fit:[]`? warm ms: ___ |
| TC-07 edit → miss | ☐ | |
| TC-08 version bump → miss ⭐ | ☐ | |
| TC-09 dead image | ☐ | broken box (expected), no hang |
| TC-10 timeout | ☐ optional | |
| TC-11 Bulgarian ⚠️ | ☐ record | locl correct? y/n |
| TC-13 autoFit ⭐ | ☐ | shrunk:N? overflow not clipped? |
| TC-12 carousel latency | ☐ | 1 slide: ___ / 8: ___ |

**Phase 0 render core is accepted when** A-1–A-3 pass and TC-01–TC-09 + TC-12 pass, with TC-11 recorded
(not gating) and 2.4/2.7 tracked as follow-ups.
