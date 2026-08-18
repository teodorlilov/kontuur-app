---
version: 1
slug: "src-app-dashboard-analytics"
primary_target: "src/app/(dashboard)/analytics"
related_targets: []
---

Scope: the /analytics dashboard surface (agency mode). Mode: Operate.

Audience & job: the agency operator's per-client check-in AND the client-facing report, weighted equally — resolved structurally, not by compromise: the page IS the document (presentation order, print = the report) and the operator layer rides on top as screen-only chrome (range control, state toggle — .print-hide).

Chosen direction: the Comparison Console (seed dd6afdf9, candidate 6/7, grounded). Every number reads against the previous period. No tabs. Section order: masthead+narrative → summary strip (direction-01 idiom: hairline cells, Label over Metric, delta chip, sparkline) → reach day-by-day (now vs then lines) → views by follower type → reach by format → interaction small multiples (per-pair scale) → profile taps by button → follower-vs-engaged demographics (+ sage then-ticks) → posts table (per-post follows/profile visits, median-relative tags) → report archive → sync line.

Chart vocabulary (frozen): Deep Pine #164430 = this period; sage = previous (#7fa588 fills, always value-labeled; #6f957a for 2px strokes, 3.4:1); Living Green = the now-instant AND the second series within a single period, never "then"; deltas color by desirability (forest-on-wash up / clay down); nominal bars one hue, identity by row label; validated pair ΔE 33 — never three greens in one plot (2e9e68↔7fa588 fails at ΔE 5.2).

Memorable moment: the 9 Aug peak — a Living Green now-dot with white ring and the labeled best-day callout; motion commitment: the now-line draws in over the already-visible then-line (reduced-motion aware).

Data premise: reads ONLY from stored tables (ig_account_metrics / ig_post_metrics / ig_audience_snapshots, nightly cron) — no live Graph calls in the request path. First-day state holds occupied heights, hatching = absence, "first sync tonight 03:30".

Unresolved / owed at implementation: the stale-sync/reconnect state (Amber sync line); mobile keeps horizontal-scroll chart landing on the recent edge; Cyrillic client names gate the serif per hasCyrillic(); Export = print stylesheet on .app-shell hooks.

Mock: docs/redesign-mocks/kontuur-analytics.html (finish review PASS, 2026-08-18).
