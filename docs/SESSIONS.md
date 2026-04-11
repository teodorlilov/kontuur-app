# PostFlow — Build Sessions 1–9

> Use these in order, one session at a time.
> Do not start a new session until the current one works correctly in your browser.
> The full feature spec lives in `docs/MASTER_PROMPT.md`.
> The technical standards live in `docs/ARCHITECTURE.md`.

---

## Session Reminder

> **Paste this block at the start of every session, before the session-specific instructions.**

```
We are building PostFlow — a social media management SaaS.
The technical architecture is defined in ARCHITECTURE.md which
you have already read and confirmed.

Strict rules for every session:
- Follow the folder structure from ARCHITECTURE.md exactly
- TypeScript straict mode, no 'any' types
- Named exports only, no default exports for components
- All AI prompts in lib/anthropic/prompts/ as separate files
- All API routes authenticate the user and verify agency ownership
- Server Supabase client in API routes, browser client in hooks
- Never call Anthropic API from components or client code
- RLS policies on every table

Current session: [REPLACE WITH SESSION NUMBER AND NAME]
```

---

## Session 1 — Project Setup and Database

Build the project foundation. Complete all steps before stopping. Do not build any UI until this session is done.

### Step 1 — Initialise the Project

```bash
npx create-next-app@latest postflow-app \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"

npm install @supabase/supabase-js @supabase/ssr \
  @anthropic-ai/sdk lucide-react recharts jspdf resend \
  clsx tailwind-merge
```

### Step 2 — Create the Folder Structure

Create all folders and placeholder index files from `ARCHITECTURE.md` Part 2. Empty files are fine — we fill them in subsequent sessions.

### Step 3 — Create Foundation Files

**`lib/utils/constants.ts`** — all app constants:

```typescript
export const MAX_POST_HISTORY_COUNT = 50
export const MAX_CAROUSEL_SLIDES = 10
export const MIN_CAROUSEL_SLIDES = 3
export const DEFAULT_CAROUSEL_SLIDES = 6
export const APPROVAL_TOKEN_EXPIRY_HOURS = 48
export const MAX_CONCURRENT_AI_CALLS = 3
export const BEST_TIME_REFRESH_DAYS = 30
export const DEFAULT_MODEL = 'claude-sonnet-4-5'
export const DEFAULT_MAX_TOKENS = 4096
export const TRIAL_DAYS = 14
```

**`lib/utils/cn.ts`** — Tailwind class merging:

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**`lib/utils/format.ts`** — formatting helpers:

- `formatDate(date: Date): string`
- `formatRelativeTime(date: Date): string`
- `truncateText(text: string, maxLength: number): string`

**`lib/supabase/client.ts`** — browser Supabase client

**`lib/supabase/server.ts`** — server Supabase client

**`lib/anthropic/client.ts`** — Anthropic client with env validation

### Step 4 — Create Type Definitions

**`types/database.ts`** — TypeScript interfaces for every database table matching the schema in `MASTER_PROMPT.md` Section 2 exactly. Include `Row`, `Insert`, and `Update` types for each table.

**`types/api.ts`** — request and response types for all API endpoints.

### Step 5 — Create Environment Files

- `.env.local` with all keys from `MASTER_PROMPT.md` Section 3
- `.env.example` with all keys listed, no values, with comments explaining each

### Step 6 — Configure Middleware

`middleware.ts` protecting all routes under `/(dashboard)/`. Allow public access to: `/login` · `/signup` · `/approve/[token]` · all `/api/approval` routes.

### Step 7 — Provide Complete SQL

Output the full schema from `MASTER_PROMPT.md` Section 2 plus RLS policies for every table. Use this RLS pattern:

```sql
alter table [table_name] enable row level security;

create policy "[table]_agency_isolation" on [table_name]
for all using (
  agency_id = (
    select agency_id from users where id = auth.uid()
  )
);
```

For tables without `agency_id` (e.g. `posts` which has `client_id`), join through `clients` to get `agency_id`.

### Step 8 — Configure Tailwind

Add PostFlow colour tokens to `tailwind.config.ts`:

```typescript
colors: {
  brand: {
    purple: '#534AB7',
    'purple-light': '#EEEDFE',
    'purple-mid': '#7F77DD',
  }
}
```

### ✓ Verify Before Stopping

- [ ] All folders created per `ARCHITECTURE.md`
- [ ] Foundation files exist with correct content
- [ ] SQL block provided and ready to run in Supabase
- [ ] `.env.example` committed, `.env.local` in `.gitignore`
- [ ] No TypeScript errors (`npx tsc --noEmit`)

---

## Session 2 — Authentication and Layout

### Step 1 — Authentication Pages

**`app/(auth)/login/page.tsx`:**

- Email + password form
- `supabase.auth.signInWithPassword`
- Redirect to `/dashboard` on success
- Link to `/signup`
- Error toast on failure

**`app/(auth)/signup/page.tsx`:**

- Email · password · business name inputs
- Mode selector: `'I manage social media for clients'` or `'I manage my own business socials'`
- On submit:
  1. Create Supabase auth user
  2. Insert into `agencies` (name, mode)
  3. Insert into `users`
  4. If solo: auto-create one client named after the business, set `plan: 'solo'`
  5. Redirect to `/dashboard`

### Step 2 — Global Auth Context

**`components/providers/auth-provider.tsx`:**

- Fetch current user on mount
- Fetch their agency and users record
- Expose: `user` · `agency` · `agencyMode ('agency' | 'solo')`
- Wrap `app/(dashboard)/layout.tsx` with this provider

### Step 3 — Dashboard Layout

**`app/(dashboard)/layout.tsx`:**

- Requires authentication (redirect if no user)
- Renders sidebar + topbar + main content area
- Passes `agencyMode` to sidebar for navigation variant

### Step 4 — Sidebar Component

**`components/layout/sidebar.tsx`:**

- Agency mode: full navigation (Section 4 of master prompt)
- Solo mode: simplified navigation (Section 4)
- Active state highlighting for current route
- Mobile: collapses to hamburger drawer with backdrop overlay
- PostFlow logo at top · Settings link at bottom
- Touch-friendly tap targets (minimum 44px)

### Step 5 — Topbar Component

**`components/layout/topbar.tsx`:**

- Page title (passed as prop)
- Notifications bell with unread count badge
- Notifications dropdown: last 10, mark as read on click

### Step 6 — Primitive UI Components

Build these before anything else needs them:

| Component                    | Variants                                               |
| ---------------------------- | ------------------------------------------------------ |
| `components/ui/button.tsx`   | primary · secondary · ghost · danger; sizes sm/md/lg   |
| `components/ui/input.tsx`    | with label and error state                             |
| `components/ui/textarea.tsx` | with label and error state                             |
| `components/ui/select.tsx`   | with label and error state                             |
| `components/ui/badge.tsx`    | success · warning · danger · info · default · priority |
| `components/ui/card.tsx`     | basic card container                                   |
| `components/ui/modal.tsx`    | overlay with close button                              |
| `components/ui/spinner.tsx`  | loading spinner                                        |
| `components/ui/toast.tsx`    | install and configure react-hot-toast or sonner        |

### Step 7 — Loading States

Each page directory needs a `loading.tsx` with a skeleton placeholder relevant to that page's content.

### Step 8 — Dashboard Placeholder

Create `app/(dashboard)/dashboard/page.tsx` showing `'Dashboard coming in Session 3'` to verify auth flow works.

### ✓ Verify Before Stopping

- [ ] `/login` loads and accepts credentials
- [ ] `/signup` creates a user and redirects correctly
- [ ] Mode selection affects sidebar navigation
- [ ] Authenticated users see the sidebar layout
- [ ] Unauthenticated users redirect to `/login`

---

## Session 3 — Dashboard and Client Management

### Step 1 — Dashboard Page

**`app/(dashboard)/dashboard/page.tsx`** — Server Component.

Fetch server-side:

- Count of active clients for this agency
- Count of posts with status `pending_review`
- Count of posts with status `scheduled` this week
- Count of posts with status `published` all time
- All clients with their pending post counts
- Latest `intelligence_briefing` for this agency

**Agency mode layout:**

- 4 stat cards
- Intelligence briefing card (placeholder text if none exists yet)
- Client list rows with name · niche · pending badge
- `'Review X pending posts'` button if count > 0

**Solo mode layout:**

- Simplified stat cards with plain language labels
- Intelligence briefing card prominently at top
- Action nudge in highlighted purple box
- No client list

### Step 2 — Clients List Page

**`app/(dashboard)/clients/page.tsx`** — Server Component.

- Fetch all clients with brand profiles
- Each row: name · niche · posts/week · platforms · pending badge · Edit button
- `'+ Add client'` → `/clients/new`
- Empty state for new agencies

### Step 3 — Smart AI Onboarding Interview

**`app/(dashboard)/clients/new/page.tsx`** — Client Component (requires interactivity).

**Stage 1 — Chat interview:**

- Chat UI with AI avatar (`✦`)
- Progress bar: Step X of 6
- AI bubbles left, user response bubbles right
- Quick-reply chips below each question
- Text input for custom answers
- Questions one at a time in sequence (Q1–Q6 from `MASTER_PROMPT.md` Section 8)
- Typing indicator (animated dots) while AI is responding
- After Q6: call `/api/ai/onboard`, show `'Building your client profile...'`

**Stage 2 — Profile review:**

- Display generated profile in editable sections
- Each section: label · content · Edit button (switches to inline textarea)
- Chips for `target_audience`, `social_goals`, `content_pillars`, `recommended_platforms`
- Yellow health niche warning if `is_health_niche`
- Autonomous schedule dropdowns
- `'Confirm and save client'` button
- `'Redo interview'` button

**On save:**

1. POST to `/api/clients`
2. API creates: `clients` row · `brand_profiles` row · `posting_schedules` row
3. Trigger best time generation: call `/api/ai/best-time`
4. Redirect to `/clients`

### Step 4 — Client Edit Page

**`app/(dashboard)/clients/[id]/edit/page.tsx`:**

- Load existing client and `brand_profile` server-side
- Full edit form with all fields from `MASTER_PROMPT.md` Section 9
- Platform pill toggles
- Autonomous schedule section
- `is_health_niche` toggle
- Connected accounts section showing Phase 2 placeholder
- Save and Cancel buttons

### Step 5 — API Routes

| Route                           | Methods                     |
| ------------------------------- | --------------------------- |
| `app/api/clients/route.ts`      | GET (list), POST (create)   |
| `app/api/clients/[id]/route.ts` | GET (one), PUT, DELETE      |
| `app/api/ai/onboard/route.ts`   | POST — profile generation   |
| `app/api/ai/best-time/route.ts` | POST — best time generation |
| `app/api/ai/pillars/route.ts`   | POST — pillar suggestions   |

All routes: authenticate · verify agency ownership · validate input · handle errors.

Best time prompt file `lib/anthropic/prompts/best-time.ts` uses `web_search` tool as defined in `MASTER_PROMPT.md` Section 24. Saves result to `brand_profiles.best_time_json`.

### ✓ Verify Before Stopping

- [ ] Dashboard loads with correct stats for both modes
- [ ] Client list shows all clients with correct data
- [ ] New client interview flows through all 6 questions
- [ ] Profile review displays generated data correctly
- [ ] Edit client form loads and saves correctly
- [ ] Best time generated and saved on client creation

---

## Session 4 — Generation Flow

> This is the most important session. Build each sub-feature and test it before moving to the next.

### Step 1 — Create All AI Prompt Files First

Create every prompt file before building any UI. Each exports a typed async function that builds the prompt, calls Claude, parses JSON, and returns typed data.

| File                                         | Purpose                                   |
| -------------------------------------------- | ----------------------------------------- |
| `lib/anthropic/prompts/generate-post.ts`     | Single image post generation              |
| `lib/anthropic/prompts/generate-carousel.ts` | Carousel post + slides generation         |
| `lib/anthropic/prompts/generate-reels.ts`    | Reels script generation                   |
| `lib/anthropic/prompts/validate-quality.ts`  | Content quality check (single + carousel) |
| `lib/anthropic/prompts/validate-language.ts` | Language validation with auto-fix         |
| `lib/anthropic/prompts/detect-slop.ts`       | AI slop / authenticity detection          |
| `lib/anthropic/prompts/research-topics.ts`   | Trending topic web search                 |

Use the exact prompts from `MASTER_PROMPT.md` Sections 10 and 19. Do not shorten or paraphrase them.

### Step 2 — Generation API Route

**`app/api/ai/generate/route.ts`:**

1. Accept: `clientId` · `platform` · `themes` · `postType` · `slideCount` · `selectedPillars` · `priorityPosts`
2. Load client `brand_profile` and `language_rules` for their language
3. Load `post_history` (last 50) for this client
4. For each theme: generate post(s) → run all three validations in sequence
5. Save `generation_run` and `generation_themes` records
6. Return all generated posts with validation data attached

### Step 3 — Generate Page

**`app/(dashboard)/generate/page.tsx`** — multi-step Client Component.

Steps controlled by `currentStep` state. Build sub-components first:

| Component                                     | Purpose                        |
| --------------------------------------------- | ------------------------------ |
| `components/generate/priority-post-form.tsx`  | Priority post rows             |
| `components/generate/theme-row.tsx`           | Single theme input row         |
| `components/generate/pillar-selector.tsx`     | Toggleable pillar chips        |
| `components/generate/post-type-selector.tsx`  | Single/Carousel/Reels selector |
| `components/generate/research-results.tsx`    | Trending topic results         |
| `components/generate/generation-progress.tsx` | Generation loading state       |

**Step 1** — client + platform selector. Load client defaults when selected.

**Step 2** — priority posts. Optional rows with title · brief · platform · date.

**Step 3** — weekly themes. Dynamic rows + running total + Research button (calls `/api/ai/research`).

**Step 4** — content pillars. Toggleable chips + Suggest more pillars button (calls `/api/ai/pillars`, adds permanently to client profile on click).

**Step 5** — post type. Single / Carousel / Reels. Slide count for carousel (pre-filled from client defaults).

**Step 6** — generated posts. Loading state showing `'Generating post X of N...'`. Posts displayed as post cards.

### Step 4 — Post Card Components

| Component                              | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `components/posts/post-card.tsx`       | Main container with all badges and actions                   |
| `components/posts/carousel-slides.tsx` | Slide tab bar with quality dots, copy buttons, rewrite panel |
| `components/posts/reels-script.tsx`    | Hook · points · CTA · on-screen text · visual directions     |
| `components/posts/quality-scores.tsx`  | Human/Hook/CTA score bars, colour coded                      |
| `components/posts/language-panel.tsx`  | Issues list with Apply all fixes button                      |
| `components/posts/slop-detector.tsx`   | Authenticity score with warning badges                       |

**Carousel `Copy all slides`** button formats all slides for pasting directly into Canva text boxes, separated by `---`.

### Step 5 — Research and Pillar API Routes

| Route                          | Prompt file                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| `app/api/ai/research/route.ts` | `lib/anthropic/prompts/research-topics.ts` (web_search enabled) |
| `app/api/ai/pillars/route.ts`  | `lib/anthropic/prompts/suggest-pillars.ts`                      |

### ✓ Verify Before Stopping

- [ ] All 5 steps of the generate flow are navigable
- [ ] Theme research returns results and adds to theme list
- [ ] Pillar suggestions appear and can be added permanently
- [ ] All three post types generate correctly
- [ ] All three validation systems show results on cards
- [ ] Language `Apply all fixes` updates the post text
- [ ] Copy buttons work (clipboard)
- [ ] Approve saves to database with correct status and `quality_score_avg`

---

## Session 5 — Review Queue and Calendar

### Step 1 — Review Queue Page

**`app/(dashboard)/review/page.tsx`:**

- Server Component for initial load
- Fetch all posts for this agency with status `pending_review` or `approved`
- Sort: priority posts first, then by `created_at`
- Include client name via join

Filter tabs: All · Pending · Approved · Priority (client-side filtering of loaded posts)

Each post renders `post-card.tsx` with additional review features:

- Approval token status if one exists
- `'Send to client for approval'` button
- Schedule button opening a date-time picker

Health client posts: yellow `'Health content — review carefully'` banner.

### Step 2 — Client Approval Portal

**`app/api/approval/send/route.ts`:**

1. Accept `postId` and `clientEmail`
2. Generate unique token (uuid)
3. Insert into `post_approval_tokens`
4. Send email via Resend with magic link
5. Return success

**`app/approve/[token]/page.tsx`** — public page, no auth required:

- Fetch post via token. Verify not expired and not already used.
- Show full post content (caption · slides · reels script)
- `'Looks good — approve'` and `'I would like some changes'` + textarea buttons
- On approve: update token status, notify agency
- On changes: update token status, save note, notify agency

**`app/api/approval/[token]/route.ts`:**

- Handle both approve and changes responses
- Update `post_approval_tokens`
- Create notification for agency

**Post card approval status badges:**

| Status              | Badge                                          |
| ------------------- | ---------------------------------------------- |
| `pending`           | amber `'Awaiting client approval'`             |
| `approved`          | green `'Client approved ✓'`                    |
| `changes_requested` | red `'Changes requested'` + client note inline |

### Step 3 — Calendar Page

**`app/(dashboard)/calendar/page.tsx`** — Client Component (interactive navigation).

Build calendar grid from scratch:

- 7 columns (Mon–Sun), rows for each week of the current month
- Prev/Next month navigation
- Fetch all posts with `scheduled_at` in the current month range

Per post: small coloured chip with client name. Assign consistent colours per client cycling through an 8-colour palette.

**Side panel on chip click:**

- Full caption (carousel: slides in tabs · reels: full script)
- Best time recommendations from `brand_profiles.best_time_json`
- Best day chips → clicking selects that day in date picker
- Best time chips → clicking fills the time picker
- Date-time picker · Platform selector · Save button

### Step 4 — Post API Routes

| Route                         | Methods                                    |
| ----------------------------- | ------------------------------------------ |
| `app/api/posts/route.ts`      | GET (list with filters), POST              |
| `app/api/posts/[id]/route.ts` | GET, PUT (status/schedule/caption), DELETE |

ADDITION 1 — Add crawl page limits

In brand_profiles add:

- crawl_pages_used integer DEFAULT 0
- crawl_pages_limit integer DEFAULT 50

In /api/clients/[id]/crawl-website:

- Check crawl_pages_used against plan limit
  (derive from agencies.plan)
- If at limit: return 402 with message
  'Crawl credit limit reached — upgrade your plan
  or wait for next month'
- After crawl: increment crawl_pages_used by
  pages fetched

Reset crawl_pages_used to 0 on the 1st of each
month via cron job.

Plan limits:
free: 50 pages/month
starter: 500 pages/month  
agency: 2000 pages/month
agency_pro: 10000 pages/month

ADDITION 2 — Make the scraper provider configurable

In .env.local add:
SCRAPER_PROVIDER=firecrawl

# future values: jina, brightdata, scrapingbee

In lib/sources/fetch-website.ts:
Read SCRAPER_PROVIDER and route to the appropriate
implementation. All implementations return the same
interface: { markdown: string, error?: string }

This means swapping scraper providers in the future
requires only adding a new implementation function
and changing one env var — zero application changes.

### ✓ Verify Before Stopping

- [ ] Review queue shows all pending/approved posts
- [ ] Priority posts appear first with red badge
- [ ] Filter tabs work correctly
- [ ] Approval email sends and shows token status on card
- [ ] `/approve/[token]` loads and processes correctly on production URL
- [ ] Calendar renders correct month with posts on correct dates
- [ ] Clicking post opens side panel
- [ ] Best time chips fill the date/time picker
- [ ] Saving a schedule updates post status to `'scheduled'`

---

## Session 6 — Analytics, Intelligence, and Reports

### Step 1 — Analytics Page

**`app/(dashboard)/analytics/page.tsx`** — Client Component.

Controls: client selector + date range picker (default last 30 days) + Generate report button.

**Data to calculate for the period:**

- Posts generated · approved (+ approval rate %) · published
- Content pillars covered and frequency
- Average `quality_score_avg`
- Quality trend (avg of last 10 vs prior 10 posts)
- Most approved themes · Most rewritten themes

**Display:**

- 4 metric cards
- AI summary in purple-tinted box
- Content pillars coverage bar chart (Recharts)
- Quality trend indicator
- Themes effectiveness table

**Phase 2 placeholder section** — clear box showing what unlocks with Meta connection.

**`'Generate client report'`** button → PDF download.

### Step 2 — Report API and PDF

**`app/api/reports/route.ts`:**

- Accept `clientId` · `periodStart` · `periodEnd` · `format`
- Calculate all internal metrics
- Call AI for summary (Section 27 prompt from `MASTER_PROMPT.md`)
- If `format: 'pdf'`: generate via jsPDF, return PDF buffer

**`lib/pdf/report.ts`:**

- `generateActivityReport(data)` function
- PDF header: agency name + logo — **not** PostFlow branding
- All metrics, AI summary, themes table
- Footer note about Phase 2 engagement data
- Page numbers

**`lib/anthropic/prompts/activity-summary.ts`** — the AI summary prompt from Section 27.

### Step 3 — Intelligence Briefing System

**`lib/anthropic/prompts/intelligence-briefing.ts`** — weekly briefing prompt from Section 22. Uses `web_search` tool. Returns structured JSON.

**`app/api/ai/intelligence/route.ts`:**

- Fetch all niches for this agency's clients
- Fetch recent posts summary
- Call briefing prompt, save to `intelligence_briefings`

**`app/api/ai/intelligence/tip/route.ts`** — on-demand single tip (2-sentence response).

**`components/intelligence/briefing-card.tsx`:**

- Platform updates (hidden if empty array)
- Niche trends per client
- Weekly tip
- Action nudge in highlighted box
- Expandable sources list
- `'Get a tip'` button showing result in popup overlay

### Step 4 — Add Intelligence to Cron Job

Update `app/api/cron/generate/route.ts` to:

- Check if this week's briefing exists for this agency
- If not: generate and save it

### Step 5 — Settings Pages

**`app/(dashboard)/settings/team/page.tsx`** — list members, invite by email

**`app/(dashboard)/settings/account/page.tsx`** — agency name, logo upload, plan display, billing placeholder

### ✓ Verify Before Stopping

- [ ] Analytics page calculates and displays metrics correctly
- [ ] `'Generate client report'` produces a PDF download
- [ ] PDF has agency name/logo, not PostFlow branding
- [ ] Intelligence briefing card shows on dashboard
- [ ] `'Get a tip'` button returns a relevant tip in a popup
- [ ] Settings pages load and save correctly

---

## Session 7 — Autonomous System and Cron Job

### Step 1 — Complete Cron Job

**`app/api/cron/generate/route.ts`:**

1. Verify Vercel Cron auth: `Authorization: Bearer {CRON_SECRET}`
2. Fetch all `posting_schedules` where `is_active = true`
3. For each active schedule:
   - Check if today matches `auto_generate_day`
   - Load client · `brand_profile` · `post_history` (last 50) · `language_rules`
   - Read `weekly_mix_json` for carousel + single counts
   - Generate each post type using the correct prompt function
   - Run all three validations on each post
   - Save posts with `status: 'pending_review'`
   - Save `topic_summary` to `post_history` per post
   - Save `quality_score_avg` on each post
   - Create notification: `'N posts ready to review for {client_name}'`
4. Check `intelligence_briefings`: if none for this week, generate one
5. Check `best_time_updated_at`: if older than `BEST_TIME_REFRESH_DAYS`, regenerate
6. Return `{ processed: N, posts_created: N, errors: [] }`

**Error handling:** if one client fails, log and continue. Never let one failure stop the entire job.

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/generate",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

### Step 2 — Performance Feedback in Generation Prompts

Update `generate-post.ts` and `generate-carousel.ts`:

1. Before generation: fetch last 20 approved posts for this client with `quality_score_avg`
2. Filter to posts with `quality_score_avg > 7.5`
3. Include in prompt: `'Previous posts that scored highest: {patterns}. Note patterns and lean toward those characteristics.'`

### Step 3 — Content Insights on Client Edit Page

Add to `/clients/[id]/edit` a content insights section. Load from `posts` table:

- Average `quality_score_avg` all time
- Trend: improving · stable · declining (last 10 vs prior 10)
- Themes with highest approval rate
- Themes with highest `rewrite_count`

Display as a simple insight box with plain language label.

### Step 4 — Solo Mode Monday Coaching Card

For `agencies.mode = 'solo'`, cron generates an additional coaching card stored in `intelligence_briefings`.

**`lib/anthropic/prompts/solo-coaching.ts`** — coaching prompt from `MASTER_PROMPT.md` Section 25. Returns 3 plain-language bullet points.

Display on solo dashboard prominently at the top.

### Step 5 — Test the Full Autonomous Loop

Manually trigger:

```bash
curl -X POST https://your-app.vercel.app/api/cron/generate \
  -H "Authorization: Bearer {CRON_SECRET}"
```

### ✓ Verify Before Stopping

- [ ] Cron endpoint runs without errors
- [ ] Posts created for each active scheduled client
- [ ] All three validations run on autonomous posts
- [ ] Notifications created correctly
- [ ] Intelligence briefing generated for the agency
- [ ] `best_time_json` refreshes when stale
- [ ] Performance feedback included in generation prompt
- [ ] Content insights show on client edit page
- [ ] Solo coaching card appears (test manually)

---

## Session 8 — Responsive Design and Polish

No new features. Quality and consistency only.

### Step 1 — Responsive Layout Audit

Check every page at 375px mobile width:

**Sidebar:** collapses to slide-out drawer · hamburger in topbar · backdrop overlay · touch targets minimum 44px

**Dashboard:** stat cards 2×2 on mobile, 4×1 on desktop · client list stacks vertically

**Generate page:** steps show as numbered circles only on mobile · theme rows stack vertically · post cards full width

**Calendar:** horizontal scroll on mobile · side panel full-screen sheet on mobile

**Analytics:** charts full width on mobile, side by side on desktop

### Step 2 — Loading Skeletons

Every page that fetches data shows a skeleton while loading. Create skeleton variants for: stat cards · client list rows · post cards · calendar grid · analytics charts.

Use Tailwind's `animate-pulse` for shimmer effect.

### Step 3 — Empty States

| Page         | Empty state message                                      |
| ------------ | -------------------------------------------------------- |
| `/clients`   | `'No clients yet — add your first client'` + button      |
| `/review`    | `'No posts waiting for review — generate some'` + button |
| `/calendar`  | `'Nothing scheduled this week'`                          |
| `/analytics` | `'Select a client and date range above'`                 |

### Step 4 — Error States

Every page needs an `error.tsx`:

- Clear error message
- Retry button
- Never show raw error stack traces to users

### Step 5 — Consistency Audit

Check every page:

- [ ] All buttons use `Button` component from `components/ui/`
- [ ] All inputs use `Input` component
- [ ] Spacing consistent (Tailwind spacing scale)
- [ ] Purple `#534AB7` used consistently for primary buttons · active nav · focus rings
- [ ] Font sizes: page titles `text-xl font-medium` · section labels `text-sm font-medium uppercase` · body `text-sm` · small labels `text-xs`

### Step 6 — Toast Notification Audit

Every user action must produce feedback:

| Action            | Toast                                                 |
| ----------------- | ----------------------------------------------------- |
| Approve post      | `'Post approved'`                                     |
| Save client       | `'Client saved'`                                      |
| Send approval     | `'Approval request sent to {email}'`                  |
| Generate posts    | `'Generating {N} posts...'` → `'Generation complete'` |
| Generation error  | `'Generation failed — please retry'`                  |
| Copy to clipboard | `'Copied to clipboard'`                               |

### Step 7 — Form Validation

Every form validates before submit:

- Required fields: red border + error message
- Email format validation
- Number inputs: min/max
- Prevent submission while loading

### Step 8 — Accessibility Basics

- [ ] All images have `alt` text
- [ ] All interactive elements have visible focus styles
- [ ] Form inputs have associated `<label>` elements
- [ ] Error messages use `aria-live` regions
- [ ] Sufficient colour contrast (check purple on white)

### ✓ Verify Before Stopping

- [ ] Every page looks correct at 375px width
- [ ] Loading skeletons appear on slow connections
- [ ] Empty states appear on fresh accounts
- [ ] All actions produce toast feedback
- [ ] Forms validate before submission
- [ ] `npx tsc --noEmit` — zero TypeScript errors

---

## Session 9 — Deployment and Production Readiness

### Step 1 — Environment Variable Audit

Every variable must be:

- [ ] Listed in `.env.example` with a comment
- [ ] Validated at startup in the relevant `lib/` file
- [ ] Not accidentally exposed to the client (no secret in `NEXT_PUBLIC_`)

### Step 2 — Deploy to Vercel

```bash
git add .
git commit -m 'feat: complete PostFlow Phase 1'
git push origin main
```

1. Go to **vercel.com** → Import project → Select your repo
2. Add all environment variables in Vercel dashboard
3. Deploy
4. Note the production URL and update:
   - `NEXT_PUBLIC_APP_URL` in Vercel env vars
   - Supabase allowed URLs in Supabase dashboard
   - Supabase Auth redirect URLs

### Step 3 — Supabase Production Configuration

In Supabase dashboard:

- Site URL: set to your Vercel URL
- Redirect URLs: add `https://your-app.vercel.app/**`
- Email templates: customise invite and magic link emails with PostFlow branding
- Connection pooling: enable for production

### Step 4 — Production Test Checklist

**Auth:**

- [ ] Sign up as agency creates account correctly
- [ ] Sign up as solo creates account + auto-client
- [ ] Login redirects to dashboard
- [ ] Logout clears session
- [ ] Unauthenticated routes redirect to login

**Client management:**

- [ ] AI interview completes and saves profile
- [ ] Edit client saves all fields
- [ ] Best time recommendations generate on save

**Generation:**

- [ ] Single post generates with all 3 validations
- [ ] Carousel generates with slide quality check
- [ ] Reels script generates correctly
- [ ] Language validation applies fixes
- [ ] Research topics returns results
- [ ] Pillar suggestions work

**Review and scheduling:**

- [ ] Approval email sends with correct magic link
- [ ] `/approve/[token]` works on production URL
- [ ] Calendar saves scheduled posts correctly

**Cron job:**

- [ ] Test manually with `CRON_SECRET` header
- [ ] Posts created in database
- [ ] Notifications created

### Step 5 — Final Build Check

```bash
npx tsc --noEmit
npm run build
```

Fix all errors before considering the build done.

### Step 6 — Create README.md

Document:

- What PostFlow is (one paragraph)
- Tech stack
- Local setup instructions
- All environment variables with descriptions
- How to run locally
- How to deploy
- Folder structure overview
- How to add a new language to `language_rules`
- Known limitations (Meta connection in Phase 2)

### Step 7 — Create PHASE2.md

Document everything needed to activate Meta analytics:

- Meta Developer App setup steps
- OAuth flow to build in `/api/auth/meta/`
- Permissions to request
- Endpoints to call for analytics
- How `best_time_json` upgrades to real audience data
- Token refresh logic

### ✓ Phase 1 Complete Checklist

- [ ] Production deployment works end to end
- [ ] `npm run build` succeeds with zero errors
- [ ] `npx tsc --noEmit` — zero errors
- [ ] All critical paths tested on production URL
- [ ] `README.md` committed to repo
- [ ] `PHASE2.md` committed to repo
- [ ] All environment variables documented in `.env.example`

---

## Phase 1 — What You Have Built

| Feature                                                | Status |
| ------------------------------------------------------ | ------ |
| Full agency SaaS with multi-client management          | ✓      |
| AI-powered smart onboarding for any niche              | ✓      |
| Three content types: single · carousel · Reels scripts | ✓      |
| Three-layer quality validation on every post           | ✓      |
| Language authenticity system (Bulgarian + English)     | ✓      |
| AI slop detection with authenticity scoring            | ✓      |
| Source-grounded fact-checking with attribution         | ✓      |
| Autonomous posting with configurable schedules         | ✓      |
| Client approval portal via magic link                  | ✓      |
| Weekly social intelligence briefing                    | ✓      |
| Dynamic best time recommendations for any niche        | ✓      |
| Internal analytics and white-label PDF reports         | ✓      |
| Solo mode for non-marketing business owners            | ✓      |
| Performance feedback loop improving over time          | ✓      |
| Production deployment on Vercel                        | ✓      |
| Full Phase 2 documentation ready                       | ✓      |

**Next:** Set up Meta Developer App (follow `PHASE2.md`), then implement Stripe billing.

---

_PostFlow Build Sessions — Phase 1_
_Use alongside `MASTER_PROMPT.md` and `ARCHITECTURE.md`_
