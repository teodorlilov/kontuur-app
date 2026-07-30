---
target: the dashboard
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-07-30T08-59-25Z
slug: src-app-dashboard-dashboard-page-tsx
---
Method: dual-agent (A: design review, source + user-supplied render · B: detector evidence, isolated)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Nothing reports the autonomous loop; queries.ts:93-99 renders a failed count as 0 under a comment claiming it prevents that |
| 2 | Match System / Real World | 2 | page.tsx:96-97 labels a card "Platforms connected" but feeds it a client count |
| 3 | User Control and Freedom | 1 | Approve commits to auto-publish with no undo (pending-review-list.tsx:38-52) |
| 4 | Consistency and Standards | 2 | coverage-row.tsx:70 has an sr-only chart summary; mini-week.tsx has none |
| 5 | Error Prevention | 1 | cache.ts:203-206 returns {} on failure -> every client reads "Nothing scheduled yet" beside a Generate button |
| 6 | Recognition Rather Than Recall | 2 | MiniWeek has no day labels; "3 of 7 days covered" never says which three |
| 7 | Flexibility and Efficiency | 1 | layout.ts:9 - 3 clients per page; no bulk approve, no keyboard path |
| 8 | Aesthetic and Minimalist Design | 2 | "5" stated in four places; "0" stated three times in one card |
| 9 | Error Recovery | 1 | Approve failure shows a toast and silently restores the row; no retry |
| 10 | Help and Documentation | 2 | Nothing defines "covered"; no chip carries a tooltip |
| **Total** | | **16/40** | **Poor - major UX work needed** |

Shape of the score: presentational heuristics (4,6,8,10) all at 2; action heuristics (3,5,7,9) all at 1. It looks finished and behaves unfinished.

Cognitive load: 6 of 8 failures (critical). Passes only on grouping. Primary decision point carries ~30 interactive targets in the content area, ~43 with chrome.

## Design Specificity Verdict

Mostly interchangeable, with two genuinely proprietary moments.

Category-interchangeable: QuickActionsStrip, StatCard, BriefingBar, DashboardHeader. Swap the strings and this ships as a CRM or helpdesk without touching layout.

Genuinely Kontuur-specific: the seven-chip week strip in coverage-row.tsx:72-87, and the hasCyrillic gate at dashboard-header.tsx:45-50.

The damning gap: the product's headline claim is an autonomous loop (PRODUCT.md:26,96) and the dashboard has no surface for it. No next-publish list, no failed-publish state, no disconnected-account alert.

Deterministic scan: 0 findings across 29 dashboard files (exit 0). Comparison run on src/components: 3 findings (2x layout-transition genuine, 1x gray-on-color FALSE POSITIVE - a ternary at post-content-display.tsx:174 where bg-purple-50 actually ships with text-purple-700). None of the three reach the dashboard.

Critical caveat: the detector's four design-system-* rules were INERT because no DESIGN.md / design-system manifest exists. Every token violation A found by hand is what those rules exist to catch (--text3 at 3.10:1 vs a 4.5:1 commitment; font-bold 700 at coverage-row.tsx:52 vs "700 stays unused"; 32px page padding vs 40px specified). A clean detector run on this repo currently means very little.

Visual overlays: none. No browser automation exposed and the dashboard sits behind Supabase auth. A user-supplied screenshot served as the render channel; all ten render observations were verified against source and none were unexplained by the code.

## What's Working

1. Timezone discipline without exception - every date path reads the agency's IANA zone; SCHEDULED_STATUSES exported from cache.ts:164 so the week count and coverage grid can never diverge.
2. The screen-reader path for a visual-only encoding - coverage-row.tsx:40-42 builds a chip summary, aria-hides the graphic, restates it sr-only exactly once.
3. The Cyrillic gate - dashboard-header.tsx:45-50 swaps serif for sans on Cyrillic agency names. Instrument Serif has no Cyrillic and half the audience is Bulgarian.

## Priority Issues

[P0] The autonomous publishing loop has no surface at all.
Why: PRODUCT principle 5 requires what happened and what is about to happen be obvious and reversible. Nearest signal is "1 of 8 connected to a platform" in 11.5px tertiary text under a green "+8 this month" pill. IG OAuth is externally blocked (PRODUCT.md:70) so this stays bad.
Fix: replace the "Published this month" card with a "Going out next" card sourced from the SCHEDULED_STATUSES query already running at queries.ts:232-240; promote unconnected clients / failed publishes into a banner above the stat row.
Command: /impeccable shape

[P0] Solo mode is agency mode with four strings swapped, and one is factually wrong.
ClientCoverage receives no isSolo prop (page.tsx:153-157) -> solo users get a "Client coverage" grid, an unexplained legend, and an "Add your first client" link to /clients/new, a route SOLO_NAV deliberately hides. "Platforms connected" passes connectedClientCount, computed as distinct client_id (queries.ts:287-291), so a solo user with IG + FB sees 1, above a "+1 this month" pill celebrating their own auto-created business record.
Fix: pass isSolo into ClientCoverage and retitle to "This week"; add a real connectedPlatformCount counting social_connections rows; suppress the clientsAddedThisMonth pill when isSolo.
Command: /impeccable adapt

[P1] The approve decision is unsafe in both directions.
Input: pending-review-list.tsx:140 renders post.caption verbatim; previews read "# POST 1 ..." - generator scaffold. No normalization exists anywhere in the codebase.
Output: handleApprove writes a status inside SCHEDULED_STATUSES (queued for the publish cron) with no confirmation and no undo; the toast carries no action and the row animates out at line 122.
Fix: add toPreviewLine(caption) stripping leading #/* markers and POST \d+ scaffold; add an Undo action to the toast and hold the row dimmed for 5s.
Command: /impeccable harden

[P1] Both data graphics mislead - decoration overriding encoding.
(a) coverage-row.tsx:11 TIER_CLASSES selected by tier = index on the current page (client-coverage.tsx:75-77). Three loud surfaces encoding nothing, directly under a Published/Scheduled/Open legend. The same client changes colour when paginating.
(b) mini-week.tsx:18 - height = isFilled ? 40 + (count/busiest)*60 : 58. An empty day renders at 58%, a day with 1 post at 55%. The empty bar is taller than the occupied one. Line 25 also gives isToday priority over fill state.
Fix: one surface for all coverage rows, spend the colour budget on pendingCount > 0; change MiniWeek to 30 + (count/busiest)*70 : 12, render today as an underline, add an sr-only summary.
Command: /impeccable layout

[P2] Contrast and focus fall below the project's own style guide, systemically.
--text3 (#8b958d) = 3.10:1 on surface, 2.71:1 on paper, carrying ~15 text roles. text-ink/55 on the lime/sage tiers = 3.87:1 / 3.76:1 but 5.04:1 on the dark tier, so legibility varies by list position. focus-visible returns zero matches across the dashboard tree; the UA outline on Approve is clipped by its overflow-y-auto container.
Fix: darken --text3 to ~#6d776f; raise text-ink/55 to /75; add a base :where(a,button,[role=button]):focus-visible rule with outline-offset, plus scroll-padding-block on the pending container.
Command: /impeccable audit

## Persona Red Flags

Alex (power user, 8 clients): page assembles under the cursor for ~1.03s (staggered 550ms rv-in animations) - clicks land on nothing. Command palette is navigation-only; cannot approve or filter. Five approvals = five full dashboard rebuilds (each revalidates tags re-running eight parallel queries). Surveying 8 clients takes 3 paginations and row colours reshuffle between pages. Two clients both named "ЕВЕРЕСТ ИМОТИ" are genuine separate records, indistinguishable in the UI.

Sam (screen reader, keyboard-only): exactly one heading on the page (dashboard-header.tsx:43); all section titles are span/b, so heading navigation yields one result. MiniWeek emits seven empty spans with no role, label, or sr-only summary, and no aria-hidden either. Zero focus-visible declarations. Six text roles below 4.5:1. count-up.tsx re-renders ~60x/s for 1000ms, so a queried value may never have been true.

Mira (solo owner): third stat card wrong on three of four lines. Shown a client-management grid she has no clients for, with an empty-state link to a route her nav hides. First-run dashboard is two large empty boxes. Day one states failure three times. Cyrillic business name breaks the serif at pending-review-list.tsx:134 and briefing-bar.tsx:31, neither guarded by hasCyrillic.

## Minor Observations

- All four quick actions are duplicate destinations.
- The number 5 is stated four times simultaneously.
- Two data-layer comments describe the opposite of what the code does (queries.ts:88-99, cache.ts:202-206).
- coverage-row.tsx:57-61 - client name is a link with no link affordance.
- font-bold (700) at coverage-row.tsx:52 contradicts STYLE-GUIDE:216.
- Page padding md:px-8 (32px) vs the guide's 40px.
- ClientCoverage has no ordering intent; page 1 is arbitrary.
- The change-requests section is conditional, so vertical rhythm shifts by data.
- The dark stat card uses a different box model from the other three.
- describePublishedDelta returns amber for any negative MoM delta - true ~25 days of every month.

## Questions to Consider

1. The product's headline is that the loop runs unattended. Why does the dashboard measure human throughput? What if the four stat cards became one sentence: "3 posts go out today. 1 client can't publish."?
2. Solo and agency are declared equal, and solo is implemented as isSolo ? on four label strings. What if solo were a different composition entirely rather than a mode?
3. ClientCoverage and PendingReviewList are forced to identical heights by one shared constant, but answer different questions. Why is either paginated rather than triaged?
4. "# POST 1" is in the database. Is the dashboard the wrong place to fix that, or exactly the right place to notice the generation pipeline is leaking scaffold into copy one click from publishing?
5. What is the dark card for? Should darkness follow state rather than position?
6. Two clients named "ЕВЕРЕСТ ИМОТИ" exist. Data problem the dashboard should surface, or UI problem it should absorb? It does neither.
7. Bulgarian is first-class, Instrument Serif has no Cyrillic, and hasCyrillic() is called exactly once in the codebase. What is the serif buying?
