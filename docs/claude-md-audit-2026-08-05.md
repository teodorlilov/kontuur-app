# CLAUDE.md Compliance Audit — redesign/dashboard vs main

**Date:** 2026-08-05 · **Scope:** the 410 changed `src/` files across the branch's 87 commits
(~104k insertions). **Method:** build gates + pattern sweep restricted to branch-added lines +
eight parallel file-by-file audit passes. Every finding below cites `file:line` and was taken from
the actual tree; items agents could not fully confirm are marked *(unconfirmed)*.

**Verdict:** the hygiene rules held (zero `console.log`, `any`, TODO, empty-catch-without-comment
in added code; `database.ts` genuinely regenerated) — but six rules were violated systemically
rather than occasionally, and seven findings are correctness-grade. Violations cluster sharply:
the API/cron layer ignores DB errors as a pattern, and roughly a dozen surfaces were built outside
the Tailwind/token system entirely.

**Correction (2026-08-06):** an earlier version of this report said all gates were green. `tsc` and
`vitest` are; **`npm run lint` exits 1** on 9 errors. The original check had been piped through
`tail`, so the exit status reported was `tail`'s. Those 9 errors are all pre-existing and already
catalogued in TECH-DEBT §4 as a deliberately deferred lint-cleanup pass — the branch did not add
them — but `npm run check` is red today. See §6.6.

---

## 1. Correctness-grade findings (fix before merge)

### 1.1 Publish scheduler can double-post to Instagram
`src/features/publishing/lib/scheduler.ts:205-213` — `markPublished` discards the Supabase update
result. If the IG publish succeeds but the status write fails, the post stays `'publishing'` with a
claim timestamp; the stale-claim clause (`scheduler.ts:69`) later reclaims and republishes it.
Same discarded-error pattern in the same file: `claimPost` (:112-123 — a DB error is read as
"another run claimed it"), `markFailed` (:223-230), `markFailedFinal` (:239), missed-window sweep
(:47-51), due-posts query (:58 — failure looks like "no posts due"). Duplicate of the pattern in
the manual path: `src/app/api/posts/[id]/publish/route.ts:86-92, :96`.
Note: the branch's own commit 610cd95 established "stop discarding write errors"; the publish cron
(82e24b3, the newest commit) does not follow it.

### 1.2 Signup reports success on failed writes
`src/lib/auth/create-user-record.ts:55-60, 78-83, 94-95` — user-row inserts and the
brand_profiles / posting_schedules inserts never check errors; a failed insert returns a successful
signup. Also `src/app/api/auth/signup/route.ts:77-81` (solo-mode client insert silently dropped,
still returns `{ success: true }`) and `:21-30,46` (`mode` written to `agencies.mode` unvalidated).

### 1.3 DB writes during page render, with a race
`src/app/(dashboard)/clients/[id]/sources/page.tsx:49-73` — a `brand_profiles` update and a
`client_sources` insert run while server-rendering a GET; the pillar-write result is discarded
(:73), and two concurrent opens both pass `needsTavily` → duplicate `'tavily'` rows.

### 1.4 `DEFAULT_CAROUSEL_SLIDES` defined twice, values diverged
`src/lib/clients/fetch-client-data.ts:82` falls back to **7**; canonical
`src/utils/constants.ts:13` is **6** (used correctly at `generation-orchestrator.ts:103`).

### 1.5 `PLATFORMS` defined twice, values diverged
`src/features/ideas/components/idea-form-client.tsx:5` local copy has `'X'`; canonical
`constants.ts:25` has `'X / Twitter'`. The ideas submit route accepts `platform?: string` with no
validation, so the divergent label reaches the DB. (Distinct from the catalogued TECH-DEBT 5.10
mixed-*case* issue — this is a different label entirely.)

### 1.6 Discarded Supabase errors across the data layer (the systemic version of 1.1/1.2)
A DB failure is indistinguishable from "no data" — no log, no throw — at:
- `src/lib/queries/db.ts` — **every helper**: :55-61, 74-79, 92-97, 112-117, 127-132, 145-150,
  173-178, 197-202, 221-228, 276-281, 303-308, 324-330, 401-407
- `src/lib/actions/post-actions.ts:91-98` (approval-token update → `ok: true` regardless),
  `:160-165` (failed read silently resets `rewrite_count` to 1), `:263-267` (`batchSchedulePosts`
  drops the error object)
- `src/lib/clients/fetch-client-data.ts:113-121` (query error reported as "Client not found")
- `src/features/publishing/lib/refresh-tokens.ts:45-50, 38-42, 98-111` (token-refresh cron reports
  a clean run while tokens drift toward expiry)
- `src/features/publishing/lib/fetch-post-images.ts:23-26, 40-44` (empty calendar/queue on DB
  error — the exact failure mode of the session-9 empty-calendar bug)
- `src/app/api/cron/generate/route.ts:45-49, 59-67, 237-242, 272-278, 315-327` +
  `helpers.ts:44-52, 60-63` (failed context fetch → every schedule skipped as "no client row")
- `src/app/api/cron/visuals/route.ts:76-79`; `src/app/api/posts/route.ts:24-27, :56, :261-265`;
  approval `email/route.ts:69-72` + `send/route.ts:38-41` notification inserts
- `src/features/review/lib/approval-batch.ts:60` (failed token cleanup leaves stale tokens)
- `src/features/clients/actions/client-actions.ts:221-225` (`syncDeletedPillars` proceeds with
  empty pillar list on error); `src/features/dashboard/queries/change-requests.ts:54-58` (every
  post renders as "Post #1" on error)
- `src/features/clients/actions/client-actions.ts:145-157` — `updateClient` returns DB failures
  without logging **and leaks raw `error.message` to the client** (contrast `createClient`, which
  logs each failure).

### 1.7 Route-handler bodies not zod-validated (Validation rule)
No zod parse in: `api/posts` POST (:183-192, manual `client_id` check only), `api/auth/signup`
(:21-30), `api/analytics/report` (:17, `as` cast), `api/ai/generate-stream` (:43-50 — trusts
`preloadedClientData` round-tripped from the browser), `api/ai/generate-from-idea` (:41-50),
`api/ai/analyze-url` (:16-23), `api/posts/[id]/visuals` (:25-31), `api/ideas/submit` (hand-rolled
guard), `api/ideas` PATCH (no schema import). Third-party responses: every Meta/IG response in
`api/meta/callback` (:46, 83, 110, 125, 142, 177, 191) and `refresh-tokens.ts:60` is
type-asserted, never parsed. Compliant counter-examples exist in the same tree:
`settings/team/invite` (:30), approval `email`/`send` (`approvalRequestSchema.safeParse`).
Boundary logging gap: `api/ai/generate-stream/route.ts:143-145` rethrows without logging — the
failure is never logged anywhere.

---

## 2. Systemic rule violations

### 2.1 Static inline `style={{}}` objects (~213 branch-added sites)
CLAUDE.md Tailwind + DESIGN.md §"Components use classes, never inline style objects".
Whole surfaces are built on static style objects (display/padding/background/borderRadius):
**auth** (login/signup/forgot-password/auth-layout/auth-slider), **calendar** (schedule-card,
month-grid, day-cell, post-event-pill, schedule-fab, unscheduled-panel/-post-item,
client-response-card), **ideas** (idea-card, idea-form-client), **canvas-editor panels**
(panel-styles.ts + every panel component), **publishing** (image-slot, canva-design-picker),
**review** (post-list, post-detail, action-bar, approval-header, feedback-box, post-list-item,
post-image-preview), **analytics** (ai-summary-strip, analytics-charts, follower-trend,
analytics-loading, empty-state-analytics, audience-summary, onboarding-success), **public approve
page** + `(public)/layout.tsx` + `app/page.tsx`, **marketing** components + legal pages (identical
`h1Style/h2Style/pStyle/dividerStyle` objects copy-pasted across terms/privacy/data-deletion),
`components/posts/post-list-parts.tsx`, `carousel-slides.tsx`, plus static module constants passed
as style (`client-coverage.tsx:62`, `pending-review-list.tsx:104`, `mini-week.tsx:50`).
Includes **hover-by-JS-mutation** instead of `hover:` classes: `day-cell.tsx:73-79`,
`post-event-pill.tsx:53-58`, `post-list-item.tsx:70-75`, `top-posts-table.tsx:61-66`,
`canva-design-picker.tsx:256-258`, `image-slot.tsx:112-119, 146-153`, marketing Nav/Hero/Features/
Footer, auth forms.

### 2.2 Raw hex / rgba where tokens exist (no WHY)
- `#f2f5f1` ×15, **no token exists**: `run-panel.tsx` (`text-[#f2f5f1]` ×13 + `bg-[#f2f5f1]/60`),
  `auth-layout.tsx:23,104`, `action-bar.tsx:121`, `wordmark.tsx:46`, `post-list.tsx:75-85`,
  `empty-state-analytics.tsx:103`, calendar/ideas toggle pills. Token candidate.
- `'#fff'`/`'#ffffff'` though `--surface` exists: schedule-card:310/368/730/839,
  unscheduled-panel:71/153/314, schedule-fab:40/56, approve page:265/297, post-list:47,
  post-detail:76, action-bar:51/94, approval-header:74, feedback-box:48/73, Hero:88, Nav:75,
  CtaSection:51, empty-state-analytics, analytics-loading:157, idea files, auth forms.
- `rgba(15,21,18,…)` hairlines though `--line`/`--line2` exist: approve:267/299,
  schedule-card:303/908 (as a *class*: `border-[rgba(15,21,18,0.07)]`), image-slot:105/248/267/326,
  segmented.tsx:38, toggle-row.tsx:50, carousel-slides:187, post-image-preview:10/16,
  approval-header:111, audience-summary:66-69.
- `chart-config.ts:3-9` hand-duplicates token values (`#2E9E68`=`--spring`, `#164430`=`--forest`,
  `#FFFFFF`, `#0F1512`=ink) — drifts silently if globals.css changes; recharts accepts
  `var(--…)` (proof: `audience-section.tsx:92` uses `fill="var(--forest)"`). Only `label` has a WHY.
  And `audience-section.tsx` / `post-day-breakdown.tsx` bypass that config anyway (§3).

### 2.3 `leading-*` / `tracking-*` overrides without the required WHY (~76 added sites)
No-WHY examples (verified): `form-panel.tsx:34`, `notification-item.tsx:84,89`,
`context-rail.tsx:45`, `confirm-dialog.tsx:39`, `insight-panel.tsx:132`, `work-column.tsx:321`,
`wordmark.tsx:35`, `day-cell.tsx:85,128` + 12 more calendar/ideas `tracking-normal` sites,
`image-slot.tsx:94,128,267,418`, `auth-slider.tsx:68`, `forgot-password-form.tsx:211-212`
(neutralizes the role's tracking in the class, then re-adds a different tracking inline),
`roster-row.tsx:85`, `row-status.tsx:69`, `change-request-card.tsx:55,73`,
`pending-review-list.tsx:186`, `next-up-card.tsx:139,159`, `connected-accounts-tab.tsx:63`,
`content-insights-tab.tsx:64`, `post-grid.tsx:51,56`, `mix-row.tsx:46`, `flow-stepper.tsx:62`,
`generating-view.tsx:218`, `setup-view.tsx:149`, `queue-insight-sections.tsx:23`,
`post-list-item.tsx:35,89,95,101,148`, `feedback-box.tsx:23,55`, `post-detail.tsx:195`, inline
`letterSpacing`: schedule-card:341, auth-layout:105/112/146/153, idea-form:142/167/367,
panel-styles.ts:4-7, approval-header:97, post-detail:182, marketing headings.
Compliant contrast (rule is followable): page-header h1 block, `palette-swatches.tsx:28`,
`style-card.tsx:78`, `flow-stepper` size WHY.

### 2.4 Arbitrary values without WHY (subset of 235 added)
One-off px values adjacent to the token scale, no comment — includes one direct token bypass:
`pending-review-list.tsx:170,175` uses `size-[44px]`/`h-[44px] w-[44px]` while `:108` uses
`size-11` (=44px) in the same file. Clusters: components/ (active-runs-card, nav-items, sidebar,
page-header family, notifications-bell, command-palette, action-link `h-[35px]`, status-pill
`h-[23px]`, section-heading `size-[27px]`, service-row, textarea, metric-card, form/* —
chip-group, context-rail, form-panel, form-section, save-bar, toggle-row — work-column,
review-grid, commitment-bar); dashboard (briefing-bar, briefing-actions `max-w-[46ch]`,
change-request-card `border-ink/[0.05]`, client-coverage `rounded-[3.5px]` ×3 + inset rgba
shadows, coverage-row, mini-week, next-up-card, quick-actions-strip, stat-card); clients roster
(channel-chips `h-[22px] min-w-[27px] px-[7px]`, roster-table, row-status, grid.ts *(unconfirmed —
header comment may count)*); generate/review (done-view `mt-[8vh] max-w-[480px]`,
generating-view `max-w-[760px] w-[70%]`, setup-view/review-view/review-queue `max-w-[1280/1440px]`,
discard-toast `w-[356px]`); onboarding/sources (step-entry `mt-[12vh]`, draft-save-bar
`duration-[420ms]` + `max-w-[1180px]` — spelled again at onboarding-shell:29 —
`border-ink/[0.06]` deviating from DESIGN.md's sanctioned `/[0.05]` hairline recipe,
page-picker/rss-step `max-h-[35-40vh]`, analytics-loading `!h-[10px] !w-[10px]` with `!important`);
calendar (schedule-card `w-[260px]`, calendar-view `min-w-[180px]`, month-grid, auth-slider,
integrations-tab); visual-identity grids.
Correctly exempt (not flagged): vw/vh/aspect/grid-template/transition-property/radix-var values,
and WHY-commented sites (pillar-editor:95, sidebar:263, shared.ts:14, sticky-shell frosting…).

### 2.5 Mutations via client `fetch()` instead of server actions
canvas-editor (`save-canvas.ts:32` PUT, `asset-client.ts:40` POST), `image-slot.tsx:188`
(upload via `void`, stuck-`uploading` on rejection) + `:209` (delete, `res.ok`-only),
`canva-design-picker.tsx:90`, `ideas-view.tsx:39` (mark_read PATCH **inside useEffect**, promise
unchecked) + `:87` (dismiss — optimistic update never rolled back), `generate-flow.tsx:290-294,
315-319` (ideas PATCH fire-and-forget, route has no zod), `use-draft-visuals.ts:333-337, 371-375`
(storage-mutating DELETE fire-and-forget, no catch), `approve-draft.ts:33` (the wizard's approve —
while the queue does the identical operation through `'use server'` zod actions; its `catch {
return false }` at :60-62 also never logs), `schedule-card.tsx:232` (publish; `void` caller +
stuck `publishing` state on rejection), `account-tab.tsx:42`, `invite-form.tsx:39`,
`signup-form.tsx:142`, `forgot-password-form.tsx:260`, `idea-form-client.tsx:61`,
`client-settings-form.tsx:207` (reanalyze), `briefing-actions.tsx:30` (tip),
`analytics-view.tsx:110` (report creation), done-view/send-to-client approval posts *(routes are
zod'd — only the server-action half violated)*, and `shell-context.tsx:153,165` — **client-side
browser-supabase DB mutation** for notifications.
No `schemas.ts` exists in: canvas-editor, publishing, visual-identity, ideas, settings, analytics,
sources, onboarding (grep for zod in the last three: zero hits). `source-actions.ts` validates by
hand. Server actions with unvalidated bare-string args: `ensureIdeaToken`
(token-actions.ts:14), `removeTeamMember` (team-actions.ts:19).

### 2.6 Data fetching in `useEffect`
`use-editor-data.ts:27-47` (editor doc+identity), `canva-design-picker.tsx:71-78`,
`approve/[token]/page.tsx:88-123` (entire page data), `shell-context.tsx:128-129`,
`use-best-time.ts:39-43` (server path exists — ReviewQueue receives `bestTimeMap` as a
server-fetched prop), `review-queue.tsx:299` (detect-slop), `report-history.tsx:33-52` +
`analytics-view.tsx:69-92` — these two **chain into a client waterfall** on every client switch
(`:85` gates the history fetch behind the connections fetch), `ideas-view.tsx:35-44`.
Polling with no RSC equivalent (rule has no carve-out — see §6): `use-active-runs.ts:59-62`,
`use-extraction-status.ts:62`.

### 2.7 `server-only` guard gaps
Repo-wide only **2 files** carry `import 'server-only'`. Missing where the rule requires it:
`lib/visual/fal.ts:17` (reads `FAL_API_KEY`; sibling generate-post-visual.ts:1 has the guard),
`lib/supabase/admin.ts` itself (comment only), `lib/queries/cache.ts`, `lib/auth/session.ts`,
`ai/research/research-orchestrator.ts`, and all five new dashboard query files
(briefing.ts, change-requests.ts, metrics.ts, publishes.ts, review-queue.ts).

### 2.8 Thin-route violations
`api/meta/callback/route.ts:22-215` (~200 lines of token-exchange + connection persistence →
belongs in lib/meta), `api/cron/generate/route.ts:28-376` (~350-line GET, steps numbered 7-14
inline), `api/posts/route.ts:98-176` (storage-relocation helpers), `approve/[token]/page.tsx`
(409-line workflow state machine → features/review), `(onboarding)/clients/new/page.tsx` (367-line
orchestration → features/onboarding), review + calendar pages (inline row types + map-building).
Related size violations: `CanvasEditorOverlay` ~650 lines (canvas-editor-overlay.tsx:63-709),
`research-orchestrator.execute()` 178 lines (:73-251), `sources-manager.tsx` 657 lines,
`top-posts-table.tsx` 160-line component with duplicated IG/FB branches.

---

## 3. Duplication inventory (both sites read and confirmed)

Shared primitive exists, re-implemented anyway:
- Input class string copied 8+ times in sources stepper (sources-manager:214/374/434,
  source-row:75/85, manual-add-modal:17, extras-step:68/237, page-picker-modal:73,
  website-pages-step:67) while `ui/input.tsx` exists — and scan-step.tsx:83 uses it correctly
- Raw `<textarea>` (sources-manager:444, source-row:99) vs `ui/textarea.tsx`
- Hand-rolled checkbox toggle (extras-step:190-200) vs `ToggleRow` — used at sources-manager:275
- Hand-rolled Buttons: empty-state-analytics:77-113 (×2, inline-styled), overview-tab:38-52,
  pending-review-list:209 (restates Button's primary variant + disabled treatment)
- `StatusPill`/`PILL_TONES` restated inline: change-request-card:38 (`ok` pairing), :85 (`warn`),
  pending-review-list:97, TagPill (schedule-card:745), PlatformPill (idea-card:183 — same feature
  uses StatusPill at idea-form-tab:125). PILL_TONES' own JSDoc forbids exactly this.
- Spinner SVG ×5: `ui/spinner.tsx` owns it; button.tsx:54-74 inlines it; login/signup/
  forgot-password forms copy-paste it (Button's `loading` prop used correctly in
  setup-password-form:105)
- Hand-rolled modal overlay (schedule-card:291-320) vs `ui/modal.tsx`; modal.tsx:25-32 vs
  command-palette:30/125 duplicate Radix shell classes
- batch-schedule-modal:72/78 hand-rolls the control look; `CONTROL_*` exists (schedule-dialog:156
  uses it)
- `timeAgo` (unscheduled-post-item:165) reimplements `formatRelativeTime` (same thresholds; same
  feature imports the shared one in two other files)
- day-cell:40 hand-builds the YYYY-MM-DD key; `toDateKey` exists and the parent month-grid:95 uses
  it for the same cell
- audience-section:74-91 + post-day-breakdown:88-106 hand-roll chart axis/tooltip config;
  `CHART_AXIS_PROPS`/`CHART_TOOLTIP_STYLE` exist and grid hex already drifted (`#f0f0f0` vs
  `CHART_COLORS.grid '#E7ECE7'`)
- `SIDEBAR_ROW` (nav-items:57, created "so the nav links cannot drift apart") — sidebar:93 restates
  it inline instead of using it

Same logic in two+ places, no shared home:
- `GeneratedPost` type ×2 (generate-flow:33, generating-view:13) duplicating the already-shared
  `ReviewDraft` (components/posts/review/types.ts:4)
- `postTypeLabel` ×2 identical (post-list-item:21-27, post-detail:98-104)
- `handleScheduleConfirm` line-for-line ×2 + `visualTallies` useMemo ×2 + focus-layout grid class
  string ×2 (review-view vs review-queue)
- Title-derivation chain ×5 (triage-buckets:32, generating-view:190, review-grid:91, draft-rail:59,
  work-column:86)
- `hostOf()` byte-identical ×2 (insight-panel:195, review-grid:69)
- `updateSlideField` re-inlined (slides-edit.ts:11 vs carousel-slides:161); copy-all-slides ×2
  (carousel-slides:151 vs work-column:116); `copyFields` re-inlined (auto-compose:10 vs
  use-editor-data:86)
- Canvas doc fetch+parse block ×4 (auto-compose:43/70/127 + use-editor-data:56);
  save-canvas:53-55 re-implements `parseAssetResponse` (asset-client:12) verbatim
- RowButton + section-header block ×2 (elements-section vs layer-list)
- zod-issues flatten ×3 (clients/schemas.ts:99, lib/canvas/doc-schema.ts:96,
  lib/visual/identity-schema.ts:49)
- `MS_PER_DAY = 86_400_000` ×3 (token-expiry:19, dashboard/metrics:7, review/triage:39) + inline
  `3_600_000` ×2 (review-queue:558, triage-buckets:179) — none in constants.ts
- `BatchPost` interface verbatim ×2 (batch-schedule-modal:8, use-batch-schedule:8);
  Button/ActionLink hand-synced variant maps (comment documents the copy)
- Ideas submission shape ×3 (IdeaBrief idea-form:7, IdeaInput ideas.ts:124, IdeaPayload
  api/ideas/submit:4) — no zod schema anywhere on the chain
- generate/schemas.ts:34-45 hand-mirrors `MetaConnection` (types/api.ts:255) and
  `ClientSourceSummary` — bridged by `as MetaConnection[]` at generate-flow:173
- page-picker-modal:68-100 vs website-pages-step:61-94 (identical picker header, filter, footer);
  cancel/skip text-button ×5 (sources-manager ×3, source-row, scan-step ×2);
  FrameIcon/IconFrame ×2 (analytics-loading:88, empty-state-analytics:124); Views-series colour
  literal ×2 (analytics-charts:92/119); test fixture `image()` ×2 (triage.test:9,
  visual-slots.test:5); legal-page style objects ×3; toggle-pill ×3 (schedule-card:829,
  unscheduled-panel:295, idea-form:230); analytics-loading duplicate JSDoc line (:26-27)

---

## 4. Placement / structure

- `components/posts/review/*` (the leaves promoted in 58423f6) is feature-aware — built on
  `PostData`/`ValidationData`, and work-column imports canvas-editor three ways (:16-18). Per the
  components-vs-features rule it belongs in `features/`. Partially catalogued: TECH-DEBT 1.3
  covers carousel-slides→ImageSlot as pre-existing; the work-column→canvas-editor coupling is new.
- `design-in-canva-button.tsx:6` imports a publishing-feature hook;
  `scheduling/use-batch-schedule.ts:5` → lib/actions; `posts/use-best-time.ts:13` fetches an API.
- `roster-row.tsx:6` + `row-status.tsx:2` import `formatPublishSlot` from
  `features/dashboard/lib/metrics` — second consumer means it belongs in a shared location
  (roster.ts:67-73 admits the coupling).
- Shared constants living outside constants.ts (single-defined; letter-of-rule):
  `USER_SETTABLE_POST_STATUSES`/`POST_PLATFORMS`/`DISCARD_REASONS` (lib/validation.ts),
  `SCHEDULED_STATUSES` (cache.ts:131), `REFRESH_WINDOW_DAYS` (token-expiry:22).
- `lib/supabase/middleware.ts:14-16` — third client instantiation (standard @supabase/ssr edge
  pattern; the rulebook has no middleware carve-out — document it rather than change it).
- `approval-batch.ts:9` + `week-schedule.ts:16` take `SupabaseClient` without the `<Database>`
  generic, erasing generated types and forcing the `as WeekScheduledPost[]` cast.

## 5. Smaller systematics

- **`as` without WHY** (~80 added): clusters in db.ts ×13, cache.ts ×4, create-user-record ×4,
  fetch-client-data ×4, meta/callback ×7, cron/generate ×12 + helpers ×3, api/posts ×4,
  dashboard/review/calendar/sources pages, utils/ai.ts ×5, analytics metrics-cast family ×8,
  sources config casts, canvas `res.json()` family, schedule-card:155/205, misc DOM-event casts.
  Compliant contrast exists throughout (cache.ts:234+, post-actions:224, runs.ts:88,
  clients/[id]/edit `.overrideTypes`, stored-validation-schema). Casts pending type-regen are
  catalogued TECH-DEBT 5.7 — keep separate.
- **`res.json()` as untyped `any`**: use-draft-visuals:146/323, use-queue-visuals:41,
  send-to-client-dialog:34, canva-design-picker:53/95, image-slot:189.
- **Missing JSDoc on exports** (rule: every exported function): most route handlers (posts,
  meta/callback, cron/generate, analytics, approval, signup, clients/[id], analyze-url,
  generate-stream), most page/layout default exports, CalendarView, marketing ×9, auth ×6,
  sources/analytics component exports (~22), client-rails ×6, EmptyState/Sidebar/Button/Spinner/
  CarouselSlides/BatchScheduleModal/useBatchSchedule, updateSession, performResearch, utils/ai ×5,
  lib/validation ×3, format ×2, cn, createApprovalBatch, postAgeDays. Wrong JSDoc: approve page
  `derivePlatform` says "most common" but returns first; fetch-post-images stacked doc blocks
  leave `fetchImagesByPost` undocumented; orphaned JSDoc ×2 (post-list-item:18, post-detail:95).
- **Dead code**: post-detail:287 `status === 'changes_requested' ? feedback : feedback` (branches
  identical); unused import `InstagramMetrics` (follower-trend:13 — ESLint *warning*, so
  `npm run lint` exits 0; consider `--max-warnings 0`).
- **`'use client'` without interactivity**: quality-scores, week-strip, visual-frame,
  content-insights-tab, skipped-banner, queue-insight-sections, post-image-preview, marketing
  Features.tsx (hover handler sets values to what they already are).
- **cn() rule**: array-join conditionals (audience-summary:66-69), template-literal ternaries
  (source-row:146, platform-row:57-59).
- **Naming**: Btn ×3 (MonthStepBtn/NavBtn/FilterBtn), abbreviations `bp/ps/rl/cr/lc/dir/idx/conn/
  h/a/w/cont`, noun-named functions (totalVisualSlots, completedDraftImages, draftStoragePaths,
  carouselStructureRules, carouselSemanticRules, hashIndex), non-question booleans (uploading,
  loading, saving, sending, approving, generating, editing, expanded, dark, low, expired…) — same
  files often use `isGenerating` correctly.
- **console convention**: `console.info` ×2 in cron/generate (:286, :369) vs the stated
  console.error/warn convention.
- **Below-boundary log-and-return** (rule says throw/propagate): cache.ts:172/230/266/304,
  runs.ts:41/62/84/122, research-orchestrator:218/274/280/308, generation-orchestrator:38/161/195,
  performance-source:72, utils/ai.ts:90-96, api/posts route helpers :122/:175 — most carry WHY
  comments (deliberate graceful degradation) but contradict the written rule → §6.
- **WHAT comments**: api/posts:23/58/194, calendar page:78, sources page:17, cron/generate
  numbered steps, empty-catch comments stating what not why (pillar-source-stepper:152,
  scan-step:39, summary-step:49; contrast sources-manager:239 which does it right).
- **Empty catches** (comment-only bodies): generate-from-idea:81 `.catch(() => {})`,
  clients/new:158, review-queue:309-311, report-history:63-64 + :77-78 + :50,
  analytics-view:91, best-time prefetch (clients/new:254).

## 6. Rulebook vs enforcement drift (decide, then fix doc or code)

1. CLAUDE.md + DESIGN.md say "never an inline `fontSize`"; the type-ramp test deliberately permits
   `fontSize: 'var(--text-*)'` and `text-[0.55em]` — ~40 call sites rely on the permission.
2. Fluid Hero Exception doc values (`clamp(28,3vw,40)` / `clamp(40,5vw,64)`) vs code
   (`28→36` CtaSection, `36→64` Hero) — lower bounds are still ramp steps so the invariant holds,
   but doc and code disagree on the numbers.
3. "Never fetch in useEffect" has no carve-out for polling (use-active-runs, use-extraction-status)
   or for public token pages; either add the carve-out or convert.
4. select-columns rule as written ("all DB column select strings") vs its own header carve-outs and
   practice: 32 added inline selects, 111 pre-existing on main. Either scope the rule (e.g. "≥3
   columns or reused → constant") or enforce it. Non-exempt adds worth fixing regardless:
   canva-team:26/34 (USER_/SOCIAL_CONNECTION_COLUMNS exist), team-actions:33, ideas.ts:89/103/109,
   post-actions:207, performance-source:31/56, fetch-client-data:115, generate-post-visual:31.
5. "Mutations go through server actions" vs a codebase where ~20 mutations POST to route handlers —
   several routes are legitimately shared (approval, publish). Decide the boundary policy (e.g.
   "route handlers only for public/token/streaming endpoints, always zod-validated") and write it
   into CLAUDE.md.
6. `npm run lint` exits 1 on 9 deferred errors (TECH-DEBT §4), so it cannot gate anything today;
   warnings like the unused import are invisible behind that. Either schedule the lint-cleanup pass
   and then add `--max-warnings 0`, or pin the known errors with targeted `eslint-disable` + reason
   so the command goes green and starts catching new breakage.
7. SocialProof.tsx:1 placeholder agency names ("Agency 2"…"Agency 5") rendered as social proof —
   no CLAUDE.md rule, but violates the project's no-fabricated-proof design rule.

## 7. Already catalogued in TECH-DEBT.md (not double-counted)

1.3 components↔features bidirectional imports (carousel-slides/ImageSlot) · 5.7 type-regen casts +
`topic_summary` select append · 5.8 generation_runs race · 5.9 visuals retry spacing ·
5.10 platform value casing.

## 8. Clean bill (verified)

`tsc` and `vitest` green (74 files / 687 tests, incl. ramp + TYPE_RAMP guards); `eslint` red on 9
pre-existing TECH-DEBT §4 errors, none added by this branch. Zero `console.log`/TODO/`any`
(typed)/uncommented-empty-catch in added lines. `database.ts` regenerated, not hand-edited.
Client Identity hexes sanctioned + in constants.ts. Konva props correctly treated as data. Clean
areas: cron publish/refresh-tokens/generation-active routes, invite + approval routes (zod'd),
settings feature components, calendar helpers + tests, clients/[id]/edit casts, clients/dashboard
schemas.ts (proper zod + z.infer), visual-identity Tailwind files, metrics.ts selects
(carve-out-compliant). Dashboard/clients scope had zero useEffect fetching.

## 9. Fix status (updated 2026-08-06)

**Applied — Wave 1 (correctness) and Wave 2 (error handling + zod):** every item in §1 is fixed.
The publish scheduler now reports lost writes as `unreconciled` instead of dropping them (with the
cron route logging them loudly); signup, `create-user-record`, `db.ts` (all 13 helpers, via one
`unwrap` helper), the token-refresh cron, `fetch-post-images`, both cron routes, `post-actions`,
`client-actions` (which no longer leaks raw DB messages to the client) and the approval paths all
check their errors; the sources page's write-on-render is extracted to
`features/sources/lib/ensure-web-research-source.ts` and race-safe behind migration 20260808; both
drifted constants now import their canonical definition. Nine route bodies and every Meta response
are zod-parsed, with new `features/ideas/schemas.ts` (which also collapses the ideas submission
shape from three hand-written copies to one) and `lib/meta/schemas.ts`.
Verified: `tsc` clean, 687 tests pass, lint warnings 12 → 11, the 9 lint errors unchanged
(pre-existing, TECH-DEBT §4).

**Applied — Wave 3 (duplication), logic half.** Nine duplicated helpers/types collapsed onto one
definition each (`toSourceHost`, `MS_PER_DAY`/`MS_PER_HOUR`, `formatZodIssues`, `ReviewDraft`,
`BatchPost`, `postTypeLabel`, `fetchCanvasState`, `parseAssetResponse`, `toDateKey`). Also fixed
real drift the audit surfaced: two analytics charts bypassed `chart-config` and had diverged to
off-palette greys, one a Tailwind default predating the palette purge. `timeAgo` was NOT merged
into `formatRelativeTime` — they produce different copy, so that is a design change, not a refactor.

**Applied — Wave 4 (styling).** Inline `style={{` 553 → 151 across six surfaces; the remainder is
runtime-computed and belongs inline. `#f2f5f1` 15 → 0 behind the new `--ink-inv` token. See
TECH-DEBT §6.3b for what was deliberately left inline and why (transition curves, unlayered
`:focus-visible`, `translate` vs `transform`, recharts, sonner) — and for the browser matrix that
is still owed.

**Applied — Wave 5, the ramp ruling.** Inline `fontSize` is now drift in every form; the guard
fails on all of it bar four path exemptions. TECH-DEBT §6.3c.

**Still open:** the primitive half of Wave 3 (Input ×8, StatusPill ×5, spinner ×5, Modal, Button —
each a rendered-output change) and the remaining §6 rulebook contradictions.

## 10. Suggested fix order

1. **Wave 1 — correctness (small diffs, high stakes):** §1.1 scheduler + publish route error
   checks; §1.2 signup path; §1.3 sources-page writes → server action (or at least check + dedupe);
   §1.4/§1.5 constants drift (delete both local definitions).
2. **Wave 2 — mechanical error-handling sweep:** destructure + handle `error` at every §1.6 site
   (one pattern, ~40 sites); zod-parse the §1.7 route bodies (schemas already exist for several
   payloads).
3. **Wave 3 — duplication paydown:** §3, starting with sites where the shared primitive already
   exists (pure deletions).
4. **Wave 4 — styling migration:** §2.1/§2.2 surface by surface (auth, calendar card, review
   sidebar, analytics, ideas, canvas panels, legal pages); mint the `#f2f5f1` token first.
5. **Wave 5 — rulebook reconciliation:** §6 decisions, then update CLAUDE.md/DESIGN.md and add
   `--max-warnings 0`.
