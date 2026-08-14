# Calendar redesign — implementation plan

> A plan, not authority. [DESIGN.md](../../DESIGN.md) outranks it on anything visual and
> [docs/CLAUDE.md](../CLAUDE.md) on anything structural. It deliberately restates no tokens.
>
> The agreed screen is [docs/redesign-mocks/kontuur-calendar-v2.html](../redesign-mocks/kontuur-calendar-v2.html).
> The diagnosis behind it is [kontuur-calendar.html](../redesign-mocks/kontuur-calendar.html).
> Delete this file when the last phase ships.

## Decisions

| | Decision | Consequence |
| --- | --- | --- |
| Working unit | **Week** is primary; month demotes to coverage | New grid; month stops being where work is placed |
| Open slots | Count from `posts_per_week` (agency-set, **fact**); time suggested from `best_time_json` (model guess, **suggestion**) | No migration. Revisit once Meta performance data lands |
| The dialog | **Reuse `ScheduleCard` as it is** | No `/posts/[id]` route; 807 KB route JS stays |
| Clients view | **Build it**, as a third tab | ~80 lines, no new query |
| Approval week | **Follows the viewed week** | ~5 lines; the server already takes `weekStart` |

Two notes on the last two, because both were nearly got wrong:

**`ScheduleCard` is reused verbatim, including the Konva editor.** An earlier draft of this
plan replaced it with a small read-only Place dialog. That was rejected: the shipped card
already carries the caption, the visual, the editor, quality and the source — everything the
decision needs. The only change is that the header stepper scopes to the client when the
dialog is entered from a slot (see Phase 3). Accepted costs, stated once: the route keeps its
807 KB, and two content editors continue to exist in the product.

**The approval fix is client-side only.** `createApprovalBatch` takes `weekStart` as an
argument and the routes pass it through; nothing recomputes a window on the server. The bug is
that `use-approval.ts` calls `getMondayISO()` with no arguments, so it always resolves to
today's Monday whatever the calendar shows.

## Phase 1 — Truth pass

The grid stops lying. Mostly deletion, and every later phase writes dates through it, so
nothing else may start first.

- **One timezone, on read *and* write.** There is no zoned wall-clock→instant helper in
  `date-helpers.ts` today — `formatScheduledAt(date, time)` builds a local-time string. Add
  one, and route every write through it. This is the prerequisite for any new writer.
- **Bucket by zoned date key.** `groupPostsByDate` slices the raw UTC string
  (`scheduled_at.slice(0, 10)`), so posts land on the wrong cell either side of midnight.
- **Sort day buckets by `scheduled_at`**, not by the query's `created_at DESC`.
- **Client hue hashes off the name.** `month-grid.tsx` indexes `CLIENT_PILL_TONES` by position
  in the visible sorted set, so filtering repaints everyone. Hashing also removes the unstable
  `getClientStyle` closure that silently defeats `memo(DayCell)` on all 42 cells.
- **Delete the dead gestures**: the HTML5 drop chain in `day-cell.tsx` (nothing sets
  `draggable`), the `noop` day click, `cursor-pointer` on every cell, and the hover shadow the
  Resting Surface Rule forbids.
- **Rides along:** `useApproval` takes the viewed week —
  `getMondayISO(viewedWeekDate, timezone)` — and the rail buttons label the week they will
  send.

Ships alone. No visual redesign.

## Phase 2 — Week view

The container the rest of the plan needs. Deliberately before ghost slots, departing from the
earlier draft: a month cell legibly holds two marks, so building ghosts there and again in the
week columns would be doing it twice.

- Seven full-height columns, time-ordered, every post reachable. Past days sunken; today takes
  the lime day plate.
- `Week | Month | Clients` rail via the existing `TabRail`, unchanged.
- The post card is rebuilt against tokens: hashed monogram, `topic_summary` instead of
  `pillar`, status carried by form before hue, a real accessible label.
- **Grid semantics once, here** — `role="grid"`, roving tabindex, arrow keys — after the markup
  has settled. Doing it in Phase 3 would mean doing it twice.
- Agenda fallback below `md`. At 375px the current grid gives 43.6px columns and
  `overflow: hidden` destroys the excess rather than scrolling it, which also fails reflow at
  200% desktop zoom.

Ships alone.

## Phase 3 — Derived slots

The calendar starts showing the target, not just the occupancy. The highest-leverage change in
the plan.

- Add the `brand_profiles(best_time_json)` embed to the calendar's client query — the same
  one `/review` already uses. `posts_per_week` needs no query change: `getCachedAgencyClients`
  already returns it and the page was discarding it.
- **Validate it at the read boundary.** It is unchecked model output stored as `Json`; three
  readers hand-cast it with `Array.isArray`. A malformed row must degrade to no suggestions,
  not throw inside a grid render.
- **Copy is a suggestion, never evidence.** Slots read "Suggested — place a post". The deficit
  count is the fact; the time is not.
- Promote `pickNextOpenSlot` from `features/review/lib/` to `src/lib/scheduling/`, and widen it
  to return **every** slot in a week rather than the first. Fix its timezone handling in the
  same commit as its test.
- Ghost slots render in `--hatch`. Past-but-unfilled renders in Amber: a record, not a task.
- **No best-time data → no ghost slots for that client.** Degrade to nothing, never to a guess.
- Clicking a slot opens `ScheduleCard` with client, date and time prefilled, and the header
  stepper **scoped to that client** — `1 of 2`, not `1 of 48`. Stepping the whole agency
  backlog from one client's slot offers posts that cannot go in it. Entered from the queue it
  behaves as today. Schedule becomes the primary button since the date is already set;
  publish-now demotes.

Ships alone.

## Phase 4 — Docked queue rail

The backlog becomes furniture beside the grid instead of an overlay covering it.

- Replace `ScheduleFab` + `UnscheduledPanel` with a docked rail; collapsible to a counted
  spine, correctly `inert` when collapsed.
- **One count.** The panel header shows an unfiltered count while the sort row shows a filtered
  one, 40px apart. It becomes `7 of 40`, with the filter named.
- Hovering a queue item lights that client's open slots.

Ships alone.

## Phase 5 — Clients view, and month as coverage

Both read data already loaded. No new query.

- **Clients**: one row per client × seven days, with the week's ratio and a verdict —
  *On track* / *N short* / *Dark this week*. Cells encode **state only**, never client hue:
  Casa Ceramics' identity hue is Clay, which collides with the failure colour.
  It is DESIGN.md's Coverage Strip, so it owes an `sr-only` sentence restating the counts.
- **Month** becomes an overview: per-day coverage bars, a week gutter showing `filled/total`,
  and a click that opens that week. It stops being where work is placed, which is what makes
  `MAX_VISIBLE = 2` and the broken `+N` badge deletable rather than fixable.
- The header gains the deficit line — *"Билков Дом has nothing this week"* — which is the one
  question the calendar exists to answer and currently cannot.

Ships alone.

## Phase 6 — Liveness and the failure lane

The calendar is frozen at page load: the cron publishes, client approvals land, and an open tab
never knows.

- Refresh on focus and after every mutation, hard-gated against clobbering in-flight edits.
- Failed posts show the reason on the card and re-arm from the peek. Re-arming resets
  `publish_attempts`, `publish_error` **and** `publish_claimed_at`, as a dedicated action rather
  than by widening the generic update whitelist. Order stays chronological — a failure is not
  sorted to the top, because a state signal must not be carried by position.
- Pending approval finally renders; today it falls through every branch. Include whether the
  72-hour link has expired.
- Per-post pending state instead of one shared `saving` flag, so a caption autosave stops
  disabling the Schedule button.
- The dashboard's "needs a human" card deep-links to the post rather than to bare `/calendar`.

Ships alone.

## Phase 7 — Drag, bulk moves, bounded queries

Speed. Optional, and last.

- One `movePost` command first; drag added on top of it as an accelerator. WCAG 2.5.7 requires
  a non-dragging single-pointer path regardless, and two write paths have already drifted once —
  `handleDrop` hardcodes noon while the modal passes a real timestamp.
- Optimistic apply, visible rollback, Undo toast. Drag is low-precision; cheap reversal beats
  any amount of hover affordance.
- Range-select and "shift by ±N days" through the existing `batchSchedulePosts`.
- View, week and client filter move into the URL — which is what finally lets the server stop
  fetching every post the agency has ever produced, with slides, validation and image rows, on
  every load.

## Independent of the redesign, owed anyway

- Lazy-load `CanvasEditor` and adapt validation server-side. Cheaper than the redesign and it
  does not depend on it.
- **Migrations from the previous sessions are still pending prod.** Phase 1 changes write paths;
  apply them and regenerate types before any of this lands.
- `npm run check` before pushing. Never verify `npm run lint` through a pipe — it exits 1.
- A manual browser matrix is owed on every phase that touches the grid.

## Still open

1. **Per-client timezones.** Everything resolves to one agency zone. If per-client zones are
   coming, slot times should be stored client-local now rather than migrated later.
2. **Nine clients.** The identity palette holds eight hues. Past eight the answer is
   monogram-plus-desaturation rather than cycling — but is a nine-client roster real soon?
3. **Upstream volume.** The page fetches five statuses, so drafts and pending-review posts are
   invisible and the calendar reads emptier than the pipeline is. Does "12 more upstream" belong
   in the header, or entirely to `/review`?
