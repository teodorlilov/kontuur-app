# Kontuur — CLAUDE.md

## Project
AI-powered social media management SaaS for agencies (kontuur.app).
Stack: Next.js 16 App Router · React 19 · TypeScript (strict) · Supabase (Postgres, Auth,
Storage) · Tailwind v4.

## Commands
- **Before pushing: `npm run check`** — typecheck + lint + format:check + deadcode +
  test, the same command `.husky/pre-push` and CI run. Everything below is for narrowing
  down a failure.
- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint` · Test: `npm test` (watch: `npm run test:watch`)
- Tests run as two vitest projects. `--project node` is pure logic (~1,270 tests, ~2s);
  `--project components` is jsdom + testing-library and matches `*.test.tsx`. The file
  extension picks the environment — a test that renders needs `.tsx`, one that does not
  should stay `.ts` and keep the fast project fast.
- Format: `npm run format` · Dead code: `npm run deadcode` · Regenerate DB types:
  `npx supabase gen types typescript --local > src/types/database.ts`
- `format:check` is **in** `check` as of 2026-08-18. It used to be excluded, and this
  file used to say "do not add it" — because prettier failed on 169 files and a
  permanently-red step is the §6.4 failure mode, not a gate. The repo is formatted now
  and `.prettierignore` covers what is not ours (vendored `.claude`, generated
  `database.ts`, markdown prose). If it goes red, run `npm run format` — do not remove
  the step.
- CI also runs `npm run build`. `tsc` does not evaluate App Router rules, so a
  server-only import reaching a client bundle type-checks clean and fails the build.

## Where things live (check here BEFORE creating anything new)
- `src/app/` — routes, layouts, route handlers, server actions entry points.
  Route files stay thin: they compose, they do not implement.
- `src/features/<feature>/` — everything specific to one feature: components,
  hooks, server actions, queries, zod schemas. Default location for new code.
- `src/components/` — shared, feature-agnostic UI only (buttons, dialogs,
  inputs, layout primitives). If a component knows about a specific feature's
  data or types, it does NOT belong here.
- `src/lib/` — shared non-UI logic: Supabase clients, utils, external API wrappers.
- `src/utils/constants.ts` — all shared constants. Never define the same value twice.
- `src/lib/queries/select-columns.ts` — all DB column select strings. Use them.
- `src/types/` — shared types. `database.ts` is generated — never hand-edit it.

**components/ vs features/ rule:** feature-aware → `features/<feature>/components/`.
Generic and dumb → `components/`. When in doubt, start in `features/` and promote
to `components/` only on the second consumer. Never the other way around.

## Next.js rules
- Server Components by default. Add `'use client'` only for interactivity,
  and push it to the smallest possible leaf component.
- Data is fetched in Server Components or server actions. Never fetch in
  `useEffect`. Never build client-side data-loading waterfalls.
- Mutations go through server actions with zod-validated input.
- Never import server-only code (admin Supabase client, secret env vars)
  into a client component. Use the `server-only` package guard in those files.
- `NEXT_PUBLIC_` env vars are the only env vars a client component may touch.

## Supabase rules
- Two clients only: the browser client (anon key) and the server client.
  Never instantiate ad-hoc clients. Service-role key is server-only, always.
- RLS is the security boundary. Never rely on client-side checks for access
  control; assume every query runs against RLS.
- All queries use generated types from `src/types/database.ts` and select
  strings from `select-columns.ts`.
- Schema changed? Regenerate types before writing code against it.

## Validation
- Every boundary input is zod-validated: form data, server action args,
  route handler bodies, third-party API responses. Schemas live in the
  feature's `schemas.ts` and types are inferred from them (`z.infer`),
  never duplicated by hand.

## Tailwind
- Use the semantic design tokens. No raw hex values, no arbitrary values
  (`w-[347px]`) unless no token exists — and then leave a WHY comment.
- Conditional classes go through `cn()`. No inline `style=` except for
  truly dynamic values (e.g. computed transforms).
- `DESIGN.md` (repo root, not `docs/`) is the design system. Its **Closed Ramp
  Rule** governs type: the ten roles are `--text-*` tokens in `globals.css`, so a
  font size is `text-body` / `text-caption` / `text-metric` — never `text-[13px]`
  and never an inline `fontSize`, including the token-valued
  `fontSize: 'var(--text-body)'` form. A size that is not a role is drift; snap it
  to the nearest one rather than adding a step. Three narrow exemptions are listed
  by path in the guard test (Konva document fields, recharts `tick` props, the
  sonner toast config) — each because a class genuinely cannot reach there.
- Each role carries its own line-height, and its letter-spacing where that is not
  `normal`. So `leading-*` or `tracking-*` at a call site means you are
  overriding the role on purpose and owe a WHY comment.
- Adding or removing a `--text-*` token means updating `TYPE_RAMP` in
  `src/utils/cn.ts` in the same change. A step missing from that array is
  silently filed as a text *colour* by tailwind-merge and deletes whatever colour
  precedes it. `src/app/__tests__/type-ramp.test.ts` fails if the two drift.

## Code quality (non-negotiable)

### No duplication
Before creating anything in a shared location (`components/`, `lib/`, `utils/`,
or a feature's `lib/`), do all three. A name grep alone does NOT satisfy this rule:

1. `ls` the target directory and read the exports of anything adjacent.
   A duplicate usually exists under a different name: an inventory finds it,
   a grep for the name you picked does not.
2. Grep by shape, not name — the type signature, the JSX structure, or the
   distinctive classes (`rounded-full`, `inline-flex items-center`).
3. Name three synonyms for what you are building and grep each.
   (pill · badge · chip · tag / panel · card · box / rail · aside · sidebar)

- Same logic in two places → extract before adding a third.
- Superseding something? Delete the original in the same change.
- Found duplication outside the current scope? Note it, don't fix it.

### Functions
- One responsibility per function. If describing it needs "and", split it.
- Called from more than one place → shared file. One place → local.
- Keep functions to roughly one screen (~40 lines). Split by responsibility,
  not by line count — never create artificial fragments just to hit a number.

### Naming
- Functions are verbs: `fetchClient`, `buildPrompt`, `validatePost`.
- Variables, types, and components are nouns describing what the thing is.
- Booleans are questions: `isLoading`, `hasError`, `canPublish`.
- No abbreviations except: id, url, db, api, ctx, err, res, req.

### Error handling
- Boundary = route handler, server action, or job entry point. Errors are
  caught and logged (with context) exactly once, at the boundary.
- Below the boundary: throw or propagate. Do not log-and-rethrow.
- No silent failures. No empty catch blocks.

### Comments
- Comments explain WHY (decisions, workarounds, constraints), never WHAT.
- Every exported function gets a one-line JSDoc.

### TypeScript
- No `any`. Unknown shape → `unknown`, then narrow.
- No `as` assertions without a WHY comment.
- Prefer inference where the type is obvious; annotate public boundaries.

### Imports
- No unused imports. No circular imports — if one seems necessary,
  the abstraction is wrong: stop and ask.

## Workflow

Before any change:
1. Check the "where things live" map, then grep for existing implementations.
2. If a change needs the same logic in two places, extract to a shared
   utility first, then use it in both.

After each change:
1. `npm run check`.
2. Remove any dead code or duplication the change introduced. Orphaned *exports*
   are caught by `npm run deadcode` (knip), which is part of `check` as of
   2026-08-18 and currently reports **zero** — so any hit is something this
   change introduced. It works at export granularity and cannot see an unused
   **field on a used type**; that shape (`topPerformingPosts`, `rssBudget`) still
   needs a human, and `deletion-ledger.test.ts` pins the ones already found.
3. State which files were modified and why. If you made a judgment call
   (e.g. where a shared function lives), state the decision and reasoning.

Some rules are enforced by guard tests rather than review. Each carries a backlog
that **may only ever shrink**, and fixing an entry without deleting its line fails
the suite:
- `src/types/__tests__/row-mirrors.test.ts` — a type covering ≥5 columns of one
  table must derive from the generated row type, not restate it.
- `src/app/api/__tests__/boundary-validation.test.ts` — a route that reads a body
  must zod-parse it.
- `src/app/__tests__/type-ramp.test.ts` — the Closed Ramp Rule.
- `src/app/api/cron/__tests__/cron-invariants.test.ts` — the scheduler never reads
  `client_ideas`, and `generation_themes` has exactly one writer.
- `src/features/__tests__/action-validation.test.ts` — a server action that takes
  arguments must parse them. CLAUDE.md names three boundaries; this is the second.
- `src/app/__tests__/component-tests.test.ts` — a `'use client'` component that owns
  state or an effect must be imported by some `*.test.tsx`. Backlog in
  `untested-components.ts`.

### Component tests
A component with state or an effect gets a test **in the same change**, not later.
Query by role and accessible name, not by class — a restyle must not break a test, and
a change that removes a control's accessible name must.

What these do and do not buy is measured, not assumed (TECH-DEBT §7.12): across the
canvas-editor arc jsdom would have caught 3 of 8 real defects, and **the three worst
were layout**, which jsdom cannot see at all. So: a green component suite is not
evidence a surface looks right, and it never replaces the manual browser pass.

Mock only leaves that reach the network or the canvas, and copy the real return shape
when you do — a mock that drifts from its subject is a test passing against a component
nobody ships.

## Do not
- Rename things that are not broken.
- Refactor files outside the current task.
- Add abstractions for hypothetical future needs — abstract only what is
  needed now.
- Leave TODO comments — fix it or don't touch it.
- Add `console.log`. Log at the boundary only, with context, using
  `console.error` / `console.warn` — the convention the ~76 existing call sites
  follow. NOTE: this is convention, not enforcement. There is no ESLint
  `no-console` rule and no `src/lib/logger`; earlier wording here claimed both.