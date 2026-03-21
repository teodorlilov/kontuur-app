# PostFlow — Master Feature Specification

> **Reference document for all build sessions.**
> Keep this open alongside each session prompt.
> This is the single source of truth for what PostFlow builds and how every feature works.

---

## Overview

PostFlow is a SaaS platform for social media marketing agencies and solo business owners. It allows users to manage multiple clients, generate AI-written social media posts using the Anthropic Claude API, review and approve posts, schedule them on a content calendar, generate analytics reports, and receive weekly social media intelligence briefings.

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase · Tailwind CSS · Anthropic Claude API · Recharts · jsPDF

---

## Section 1 — Authentication

- Agencies sign up and log in with email + password via Supabase Auth
- Sign up flow collects: email, password, agency/business name, and mode selection (see Section 25)
- After login redirect to `/dashboard`
- Protect all routes — unauthenticated users redirect to `/login`
- Team member invite: admin can invite colleagues by email from `/settings/team`. Invited users get `role: 'member'` under the same agency

---

## Section 2 — Database Schema

Run this complete SQL in the Supabase SQL editor after scaffolding. Include RLS policies for every table.

### Tables

```sql
-- AGENCIES
create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text default 'free',
  mode text default 'agency',
  agency_logo text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'trialing',
  trial_ends_at timestamp default now() + interval '14 days',
  plan_client_limit integer default 1,
  created_at timestamp default now()
);

-- USERS
create table users (
  id uuid primary key references auth.users,
  agency_id uuid references agencies(id),
  email text not null,
  role text default 'admin',
  created_at timestamp default now()
);

-- CLIENTS
create table clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id),
  name text not null,
  niche text,
  posts_per_week integer default 3,
  language text default 'English',
  created_at timestamp default now()
);

-- BRAND PROFILES
create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) unique,
  tone text,
  target_audience text,
  content_pillars text,
  avoid_topics text,
  client_testimonial_voice text,
  default_post_type text default 'single',
  default_carousel_slides integer default 6,
  weekly_mix_json jsonb default '{"carousel": 2, "single": 1}',
  language_formality text default 'neutral',
  secondary_language text,
  is_health_niche boolean default false,
  best_time_json jsonb,
  best_time_updated_at timestamp
);

-- POSTING SCHEDULES
create table posting_schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  is_active boolean default true,
  frequency_type text default 'per_week',
  frequency_value integer default 3,
  auto_generate_day text default 'monday',
  auto_generate_time text default '09:00',
  created_at timestamp default now()
);

-- POSTS
create table posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  caption text,
  platform text,
  post_type text default 'single',
  slides_json jsonb,
  carousel_quality_json jsonb,
  status text default 'draft',
  priority boolean default false,
  scheduled_at timestamp,
  published_at timestamp,
  quality_score_avg numeric,
  was_rewritten boolean default false,
  rewrite_count integer default 0,
  created_at timestamp default now()
);

-- POST HISTORY
create table post_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  topic_summary text,
  created_at timestamp default now()
);

-- GENERATION RUNS
create table generation_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  platform text,
  created_at timestamp default now()
);

-- GENERATION THEMES
create table generation_themes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references generation_runs(id),
  theme_description text,
  post_count integer default 1,
  is_priority boolean default false,
  priority_brief text,
  target_date date,
  research_used boolean default false
);

-- POST APPROVAL TOKENS
create table post_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id),
  token text unique default gen_random_uuid()::text,
  client_email text,
  status text default 'pending',
  client_note text,
  expires_at timestamp default now() + interval '48 hours',
  created_at timestamp default now()
);

-- SOCIAL CONNECTIONS (Phase 2 — Meta analytics)
create table social_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  platform text,
  account_id text,
  account_name text,
  access_token text,
  token_expires_at timestamp,
  created_at timestamp default now()
);

-- ANALYTICS REPORTS
create table analytics_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  platform text,
  period_start date,
  period_end date,
  metrics_json jsonb,
  ai_summary text,
  report_type text default 'internal',
  created_at timestamp default now()
);

-- NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id),
  message text,
  is_read boolean default false,
  created_at timestamp default now()
);

-- LANGUAGE RULES
create table language_rules (
  id uuid primary key default gen_random_uuid(),
  language text unique not null,
  banned_anglicisms jsonb,
  banned_calques jsonb,
  native_cta_phrases jsonb,
  formality_default text default 'neutral'
);

-- INTELLIGENCE BRIEFINGS
create table intelligence_briefings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id),
  briefing_text text,
  platform_updates text[],
  trending_topics jsonb,
  action_nudge text,
  weekly_tip text,
  sources text[],
  week_start date,
  created_at timestamp default now()
);
```

### RLS Policy Pattern

Apply this pattern to every table. Users can only access their own agency's data.

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

### Seed Data — Language Rules

```sql
-- Bulgarian
insert into language_rules (language, banned_anglicisms, banned_calques, native_cta_phrases, formality_default)
values (
  'Bulgarian',
  '[
    {"wrong":"свайпни","correct":"плъзни / виж следващото"},
    {"wrong":"лайкни","correct":"хареса ли ти?"},
    {"wrong":"шеърни","correct":"сподели"},
    {"wrong":"сейвни","correct":"запази публикацията"},
    {"wrong":"фолоуни","correct":"последвай ни"},
    {"wrong":"тагни","correct":"отбележи"},
    {"wrong":"букни","correct":"запази час"},
    {"wrong":"постни","correct":"публикувай"},
    {"wrong":"стори","correct":"история"},
    {"wrong":"риийлс","correct":"видео"}
  ]',
  '["Открийте силата на","Трансформирайте вашия","Отключете потенциала","Издигнете своя","В днешния свят"]',
  '{
    "carousel_swipe":["Плъзни надясно →","Виж следващото →","Продължи →","Разлисти →"],
    "book_appointment":["Запази час","Запиши се за консултация","Свържи се с нас","Пиши ни"],
    "engagement":["Разпознаваш ли се?","Случвало ли ти се е?","Какво мислиш?","Сподели в коментар"]
  }',
  'neutral'
);

-- English
insert into language_rules (language, banned_anglicisms, banned_calques, native_cta_phrases, formality_default)
values (
  'English',
  '[]',
  '["Discover the power of","Unlock your potential","Transform your","Elevate your","In today''s world","We are proud to announce","We are excited to share","Take your X to the next level"]',
  '{
    "carousel_swipe":["Swipe to see more →","Keep reading →","See what''s inside →","Swipe through →"],
    "book_appointment":["Book a consultation","Get in touch","Reserve your spot","Schedule a call"],
    "engagement":["Can you relate?","Has this happened to you?","What do you think?","Share in the comments"]
  }',
  'neutral'
);
```

---

## Section 3 — Environment Variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
META_APP_ID=
META_APP_SECRET=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
```

---

## Section 4 — Navigation and Layout

Sidebar layout on all authenticated pages.

### Agency Mode Sidebar
- Dashboard (`/dashboard`)
- Clients (`/clients`)
- Generate posts (`/generate`)
- Review queue (`/review`) — show pending count badge
- Calendar (`/calendar`)
- Analytics (`/analytics`)
- Settings (`/settings`)

### Solo Mode Sidebar
- Dashboard (`/dashboard`)
- Create content (`/generate`)
- My drafts (`/review`)
- My calendar (`/calendar`)
- My results (`/analytics`)
- Settings (`/settings`)

### Top Navbar
- Page title left
- Bell icon with unread notification count right
- Clicking bell opens dropdown of recent notifications
- Mark as read on click

---

## Section 5 — Pages: /login and /signup

**`/login`** — email + password form via Supabase Auth

**`/signup`** — collect email, password, business name, and mode:
- `'I manage social media for clients (agency)'`
- `'I manage my own business socials (solo)'`

On submit:
1. Create Supabase auth user
2. Insert into `agencies` (name, mode)
3. Insert into `users` linked to agency
4. If solo: auto-create one client named after the business, set plan to `'solo'`
5. Redirect to `/dashboard`

---

## Section 6 — Page: /dashboard

### Agency Mode
- 4 stat cards: active clients · posts pending review · posts scheduled this week · total published
- Weekly intelligence briefing card (Section 22)
- Client list rows with name, niche, pending badge
- `'Review X pending posts'` button if count > 0

### Solo Mode
- Simplified stat cards with plain language labels
- Weekly intelligence briefing card prominently at top
- Weekly action nudge in a highlighted box
- No client list

---

## Section 7 — Page: /clients

Agency mode only. Lists all clients with: name · niche · posts per week · platforms · pending badge · Edit button.

`'+ Add client'` → `/clients/new`

---

## Section 8 — Smart Client Onboarding: /clients/new

Two-stage AI interview flow.

### Stage 1 — AI Chat Interview

Chat UI with AI avatar (✦). Progress bar: Step X of 6. Quick-reply chips on each question.

| # | Question |
|---|---|
| Q1 | "What does your client actually do? Describe it like you would tell a friend." |
| Q2 | "Who are their ideal customers? Age, lifestyle, what they care about." |
| Q3 | "What is the main goal for their social media?" |
| Q4 | "How should their posts sound?" |
| Q4b | "What language and formality level?" |
| Q5 | "Anything they absolutely do not want on their social media?" |
| Q6 | "How would a happy client describe this business to a friend? One sentence." |

After all 6 answers, call the Anthropic Claude API:

```
System: "You are a social media strategist."

User: "Based on these answers generate a complete social media brand profile.
Return JSON only, no other text:
{
  niche: string,
  niche_reasoning: string,
  target_audience: string[],
  social_goals: string[],
  content_pillars: string[],
  content_pillars_reasoning: string,
  tone: string,
  avoid_topics: string,
  client_testimonial_voice: string,
  recommended_platforms: [{ platform: string, priority: string, reason: string }],
  platform_reasoning: string,
  is_health_niche: boolean,
  suggested_post_frequency: string,
  language: string,
  language_formality: string
}
Q1: {answer1} | Q2: {answer2} | Q3: {answer3}
Q4: {answer4} | Q4b: {answer4b} | Q5: {answer5} | Q6: {answer6}"
```

### Stage 2 — Profile Review

Display generated profile in editable sections:
- Niche (with `niche_reasoning` in tinted box)
- Target audience (chips)
- Social media goals (chips)
- Content pillars (chips + reasoning)
- Brand tone · Topics to avoid · Client testimonial voice
- Recommended platforms (with reasoning)
- Autonomous schedule (Section 11)

If `is_health_niche` is true show yellow notice:
> "This is a health-related client. All generated posts will include medical safety instructions. Human review is mandatory before any post is published."

On **Confirm and save**: insert into `clients`, `brand_profiles`, `posting_schedules`. Then trigger best time generation (Section 24).

---

## Section 9 — Page: /clients/[id]/edit

Full edit form for all brand profile fields. Every field from the brand profile is editable here. Also includes:

- Platform pill selectors: Instagram · Facebook · LinkedIn · X/Twitter · TikTok
- Autonomous schedule section (Section 11)
- `is_health_niche` toggle
- **Connected accounts** section — shown as Phase 2 placeholder in Phase 1

---

## Section 10 — Page: /generate

Multi-step flow with progress bar.

### Step 1 — Client and Platform
Client dropdown + platform dropdown. Selecting client loads their `brand_profile`.

Show recommended content mix hint for Instagram:
> "Carousels drive the highest engagement in 2026. Recommended: 2 carousels + 1 single per week."

### Step 2 — Priority Posts

Optional `'+ Add priority post'` rows. Each row has:
- Title · Brief · Platform · Target date

Priority posts generated first. Saved with `priority: true`. Shown with red **Priority** badge in review queue.

### Step 3 — Weekly Themes

Dynamic theme rows with: theme description · post count (default 1) · remove button.

Running total updates live.

**Research trending topics button** calls Claude with `web_search` tool:

```
"Search for what is trending right now in {niche} on social media
in {language}-speaking markets. Focus on: popular content formats,
seasonal topics, viral post angles, relevant news.
Return exactly 5 findings as JSON:
[{ finding: string, suggested_theme: string }]"
```

### Step 4 — Content Pillars

Client's `content_pillars` as toggleable chips.

**Suggest more pillars** calls Claude:
```
"Suggest 6 content pillar ideas for a {niche} account.
Return JSON: [{ pillar: string }]"
```
Suggestions appear as dashed chips. Clicking adds permanently to client profile.

### Step 5 — Post Type (Instagram only)

- Single image post (default)
- Carousel post → slide count input
- Reels script (Section 21)

### Step 6 — Generation

#### Single Image Post Prompt

```
"You are a senior social media copywriter at a top creative agency.
You write for humans, not algorithms.

CLIENT BRIEF:
Client: {client_name}
Niche: {niche}
Platform: {platform}
Theme: {theme_description}
Tone: {tone}
Target audience: {target_audience}
Active content pillars: {selected_pillars}
Topics to avoid: {avoid_topics}
Language: {language}
Formality: {language_formality}
How clients describe this business: '{client_testimonial_voice}'
Recent topics already covered — do not repeat: {post_history_last_50}

LANGUAGE RULES:
Write as a native {language} speaker.
BANNED anglicisms: {banned_anglicisms}
BANNED calques: {banned_calques}
Use only these approved CTAs: {native_cta_phrases}
Use {language_formality} address consistently. Never mix.

CAPTION SEO:
First 1-2 sentences must contain at least 2 searchable keywords
the target audience would type into Instagram or Facebook search.
Keywords describe the specific service, location if local, and
the problem the audience is trying to solve. Weave naturally.

WRITING RULES:
1. Never open with a generic statement. Open with: a question
   naming a specific feeling, a counterintuitive statement,
   a specific detail, or a direct second-person line about right now.
2. Mix short and long sentences. At least one under 6 words
   and one over 20. Never three consecutive sentences of similar length.
3. BANNED phrases: Discover · Unlock · Transform · Elevate · Journey ·
   'We are proud to' · 'We are excited to' · 'In today's world' ·
   'Did you know?' as opener · 'Book now and...' · 'The power of'
4. One CTA maximum. Specific and low-pressure.
5. HASHTAGS: Instagram max 3 niche/location specific at end.
   Facebook max 1-2 only if tied to event, default none.
   LinkedIn 3-5 professional niche hashtags.
   X/Twitter 1-2 for trending topics only.
   Never generic hashtags.
6. WORD COUNT: Instagram 150-220 · Facebook up to 300 ·
   LinkedIn 200-350 no emoji · X/Twitter under 280 chars
7. HEALTH CLIENTS: Educational only. No promised outcomes.
   No specific dosages. Always recommend consulting a professional.

Write {count} post(s) for theme '{theme_description}'.
Separate multiple posts with ---. Each must feel distinct."
```

#### Carousel Post Prompt

```
"You are a senior social media copywriter creating an Instagram carousel.

CLIENT BRIEF:
Client: {client_name} | Niche: {niche} | Theme: {theme_description}
Tone: {tone} | Audience: {target_audience}
Language: {language} | Formality: {language_formality}
Slides: {slide_count} | Avoid: {avoid_topics}
Client voice: '{client_testimonial_voice}'
Recent topics: {post_history_last_50}

LANGUAGE RULES:
BANNED anglicisms: {banned_anglicisms}
BANNED calques: {banned_calques}
Carousel swipe cues — ONLY use these, never invent:
{native_cta_phrases.carousel_swipe}

CAPTION SEO: Apply keyword-rich opener rules. First line of
main caption must contain searchable keywords for this niche.

CAROUSEL STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop
  reader must swipe to resolve. Add approved swipe cue. No body text.
- Slides 2 to (n-2): One distinct idea per slide.
  Headline + 2-3 sentence body. Self-contained.
- Slide (n-1): Value/payoff slide. Emotional or informational peak.
- Last slide: CTA only. Low-pressure. Include button text suggestion.

SLIDE QUALITY RULES:
1. Every headline must contain a specific number, named tension,
   or counterintuitive claim. NEVER topic labels or generic positives.
2. Body text must add NEW information beyond headline. Min 2 sentences.
3. Each slide covers a DISTINCT idea — check all prior slides first.
4. BANNED on all slides: Discover · Unlock · Transform · Elevate ·
   Journey · 'We are proud' · 'We are excited'
5. HEALTH CLIENTS: Educational only. No medical claims. No outcomes.

FOR EACH SLIDE: provide a design note (1-2 sentences) for Canva.

MAIN CAPTION: max 3 lines, teases carousel, ends with approved
swipe cue, 1-3 niche hashtags at end.

Return JSON only:
{
  main_caption: string,
  slides: [{
    slide_number: number,
    slide_role: 'cover' | 'content' | 'value' | 'cta',
    headline: string,
    body: string,
    cta_text: string | null,
    design_note: string
  }]
}"
```

### Post Card UI

Each generated post shows:
- Badge row: theme · platform · post type · priority flag
- Carousel badge: `🎠 Carousel · N slides`
- Reels badge: `🎬 Reels script · ~Xs`
- Main caption with Copy button
- Carousel: slide tab bar with per-slide quality dots
- Carousel: `Copy all slides` button (formatted for Canva)
- Three quality scores: Human · Hook · CTA
- Authenticity score (Section 19)
- Language validation panel with `Apply all fixes` button
- Action buttons: Approve · Edit inline · Rewrite · Discard

**Health client notice** on every card if `is_health_niche`:
> "Please verify all health-related information before approving this post."

**Approve gate for carousels:** if `overall_pass` is false, Approve is disabled. Show `'Approve anyway'` small link.

On approve: save post `status: 'approved'`, save `topic_summary` to `post_history`, save `quality_score_avg`.

---

## Section 11 — Autonomous Posting Schedule

On `/clients/[id]/edit`, **Autonomous schedule** section:

- Toggle: Autonomous mode on/off
- Frequency: 1/week · 2/week · 3/week · 4/week · 5/week · 4/month · 8/month · 12/month
- Auto-generate day: day of week
- Auto-generate time: time picker
- Carousel posts per week · Single posts per week
- Default carousel slide count: 3/4/5/6/7/8/10

### Cron Job: /api/cron/generate

When called:
1. Verify Vercel Cron auth header (`Bearer {CRON_SECRET}`)
2. Fetch all `posting_schedules` where `is_active = true`
3. For each: check if today matches `auto_generate_day`
4. If yes: load client, brand_profile, post_history, language_rules
5. Read `weekly_mix_json` — generate correct number of each type
6. Run all three validations on each post
7. Save posts with `status: 'pending_review'`
8. Save `topic_summary` to `post_history`
9. Save `quality_score_avg` on each post
10. Create notification for the agency
11. Generate weekly intelligence briefing if none exists this week (Section 22)
12. Refresh `best_time_json` for clients where `best_time_updated_at` > 30 days old

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/generate",
    "schedule": "0 9 * * 1"
  }]
}
```

---

## Section 12 — Page: /review

Posts with status `pending_review` or `approved`.

**Filter tabs:** All · Pending · Approved · Priority

Each post card:
- Red **Priority** badge if `priority: true` — always shown first
- Client name · platform · post type
- Caption preview (expandable)
- Carousel: slide count + `View slides` toggle
- Approval token status if sent (Section 23)
- Actions: Approve · Edit inline · Request rewrite · Schedule

Health client posts: yellow `'Health content — review carefully'` banner.

---

## Section 13 — Page: /calendar

Monthly calendar grid with approved and scheduled posts shown on their `scheduled_at` date. Small coloured chips per post with client name. Consistent colour per client (cycle through 8-colour palette).

Clicking a post chip opens a side panel:
- Full caption (carousel: slides in tabs · reels: full script)
- Best time recommendations from `best_time_json` (Section 24)
  — best day chips and time chips auto-fill the picker on click
- Date-time picker · Platform selector · Save button

---

## Section 14 — Meta OAuth Placeholder

On `/clients/[id]/edit` show **Connected accounts** section as a Phase 1 placeholder:

> "Connect Instagram and Facebook to unlock: real engagement analytics · audience-specific best posting times · post performance tracking"

Buttons shown as disabled with `'Coming soon'` tooltip. Build `/api/auth/meta/callback` as a stub returning `'not yet active'`.

---

## Section 15 — Page: /analytics

Phase 1: internal data only. No Meta connection required.

### Internal Activity Report

**Data for the selected period:**
- Posts generated · approved (+ approval rate %) · published
- Content pillars covered with frequency
- Average `quality_score_avg`
- Quality trend (last 10 vs prior 10 posts)
- Most approved themes · Most rewritten themes

**AI summary prompt:**

```
"You are a social media strategist summarising content activity.

Data for {client_name}, {start_date} to {end_date}:
{internal_metrics}

Write a 3-4 sentence summary covering:
- Output and consistency
- Quality trends
- What content is working well
- One specific recommendation for next period

Professional tone, flowing prose, no bullet points.
This will be sent directly to the client."
```

### Phase 2 Upgrade Placeholder

Clear labelled section showing what unlocks with Meta connection.

### Client Report PDF

`'Generate client report'` → PDF via jsPDF.
- Header: agency name + logo — NOT PostFlow branding
- All internal metrics + AI summary
- Footer note about Phase 2 engagement data

---

## Section 16 — Page: /settings

**`/settings/team`** — list team members, invite by email (Supabase invite)

**`/settings/account`** — agency name, logo upload, plan display, billing placeholder

---

## Section 17 — Styling Guidelines

| Element | Value |
|---|---|
| Primary accent | `#534AB7` |
| Pending badge | amber |
| Approved badge | green |
| Scheduled badge | blue |
| Published badge | gray |
| Priority badge | red |
| Health elements | yellow/amber tinted |
| Quality pass | `#1D9E75` green dot |
| Quality warn | `#EF9F27` amber dot |
| Quality fail | `#E24B4A` red dot |

Fully responsive. Sidebar collapses to hamburger on mobile.

---

## Section 18 — Build Order

Build in this exact sequence. Do not skip ahead.

1. Project setup: Next.js 14 · TypeScript · Tailwind · Supabase
2. Authentication + signup mode selection + route protection
3. Database SQL + RLS policies
4. Layout: sidebar (both modes) · topbar · notifications bell
5. `/dashboard` (both modes)
6. `/clients` list (agency mode)
7. `/clients/new` AI interview onboarding
8. `/clients/[id]/edit` full edit form
9. `/generate` complete multi-step flow
10. `/review` with client approval integration
11. `/calendar` with best time recommendations
12. `/analytics` internal data + Phase 2 placeholder
13. `/settings`
14. Autonomous cron job + `vercel.json`
15. Weekly intelligence briefing cron
16. Client approval portal (`/approve/[token]`)
17. Best time generation on client save

---

## Section 19 — Content Quality Validation System

Three separate API calls after every generation.

### Call 1 — Content Quality

**Single posts:**
```
"Rate this social media post. Return JSON only:
{
  human_score: number 1-10,
  hook_score: number 1-10,
  cta_score: number 1-10,
  issues: [{ type: string, description: string }]
}
Post: {generated_post}"
```

**Carousel posts:**
```
"Evaluate each slide against these rules. Return JSON only:
{
  overall_pass: boolean,
  slides_passing: number,
  slides_total: number,
  slides: [{
    slide_number: number,
    status: 'pass' | 'warn' | 'fail',
    scores: { specificity: number, hook_strength: number, info_density: number },
    issues: [{ rule: string, problem: string, suggestion: string }]
  }]
}
Rules: headline_specific · body_adds_value · no_filler ·
no_banned_phrases · not_duplicate · medical_safe
Slides: {slides_json}"
```

### Call 2 — Language Validation

```
"You are a native {language} language editor.
Check for:
1. ANGLICISMS — English words in target language script
2. CALQUES — Grammatically correct but translated from English patterns
3. GRAMMAR — Wrong conjugations, gender agreement, case endings, punctuation
4. FORMALITY — Consistent formal or informal address, never mixed
5. REGISTER — Naturalness score 1-10

Return JSON only:
{
  passes: boolean,
  naturalness_score: number 1-10,
  issues: [{
    type: 'anglicism' | 'calque' | 'grammar' | 'formality' | 'register',
    original_text: string,
    issue_description: string,
    suggested_fix: string
  }],
  corrected_text: string | null
}
Text: {generated_text} | Language: {language} | Formality: {language_formality}"
```

Show language panel with `'Apply all fixes'` button. Clicking replaces post text with `corrected_text`.

### Call 3 — AI Slop Detection

```
"Read this social media post. Assess whether it reads as AI-generated
rather than written by a real person.

AI tells to check for:
- Generic enthusiasm with no specific detail
- Perfectly balanced sentence structure throughout
- Abstract benefits with no concrete specifics
- Inspirational filler that says nothing
- Unearned authority phrases
- Triple adjective stacking
- Formulaic problem → solution → CTA with nothing surprising

Return JSON only:
{
  reads_as_human: boolean,
  ai_tells_found: string[],
  worst_offending_phrase: string | null,
  human_authenticity_score: number 1-10
}
Post: {generated_post}"
```

Show `human_authenticity_score` labelled **Authenticity**.
- Below 6: amber `'May read as AI-generated'`
- Below 4: red `'Reads as AI — rewrite recommended'`

### Single Slide Rewrite

`'Rewrite this slide'` button opens optional instruction textarea, then:

```
"Rewrite only slide {n}.
Original: {slide_content}
Issues: {issues_list}
Agency instructions: {agency_note}
Apply all carousel and language rules.
Return JSON: { headline, body, cta_text, design_note }"
```

---

## Section 20 — AI Slop Detection

Integrated into Section 19 Call 3. Display on every post card as a fourth score indicator alongside Human · Hook · CTA.

---

## Section 21 — Reels Script Generation

Third post type for Instagram. Generation prompt:

```
"Write an Instagram Reels script (15-60 seconds when spoken aloud).

CLIENT BRIEF:
Client: {client_name} | Niche: {niche} | Theme: {theme_description}
Tone: {tone} | Language: {language} | Formality: {language_formality}
Avoid: {avoid_topics} | Client voice: '{client_testimonial_voice}'

SCRIPT STRUCTURE:
- Hook (0-3 sec): One sentence. Instant curiosity or specific problem. No slow intros.
- Main content (3-45 sec): 3-5 short punchy points as spoken word. One per line.
- CTA (last 5 sec): One low-pressure action.

ALSO PROVIDE:
- On-screen text suggestions per section
- Visual direction per section (simple talking head directions)
- Estimated speaking time in seconds

Apply all language authenticity rules. No banned phrases. No anglicisms.

Return JSON only:
{
  hook: string,
  main_points: string[],
  cta: string,
  on_screen_text: string[],
  visual_directions: string[],
  estimated_seconds: number
}"
```

**Reels card layout:** hook in large text · numbered points · CTA · on-screen text chips · visual directions in italics · copy full script button.

Run same language validation and slop detection as other post types.

---

## Section 22 — Social Intelligence Feed

Weekly auto-generated briefing stored in `intelligence_briefings`. Generated in the cron job once per agency per week.

### Weekly Briefing Prompt (web_search tool required)

```
"Search the web for:
1. Any Instagram or Facebook algorithm updates, new features,
   or policy changes in the last 7 days
2. Any significant social media best practice news this week
3. Trending content topics or formats performing well right now
   for these niches: {client_niches_list}

Write a weekly social media intelligence briefing.
Plain friendly language — no jargon.
Be specific and factual. Only report real updates found in search.

Return JSON only:
{
  platform_updates: string[] (real updates only — empty if none),
  niche_trends: [{ niche: string, trend: string, action: string }],
  weekly_tip: string,
  action_nudge: string,
  sources: string[]
}"
```

### Dashboard Display

| Section | Content |
|---|---|
| What changed this week | `platform_updates` (hidden if empty) |
| Trending in your niches | `niche_trends` per client |
| This week's tip | `weekly_tip` |
| Your action for today | `action_nudge` — most prominent |
| Sources | expandable link |

Solo mode: show only `action_nudge` and `weekly_tip`.

### On-Demand Tip

`'Get a tip'` button anywhere in the platform triggers:

```
"Search for the single most useful social media tip for a {niche}
business posting on {platform} right now in {month} {year}.
One specific actionable tip in 2 sentences. Plain language, no jargon."
```

Shown in a small popup overlay. Refreshes on each click.

---

## Section 23 — Client Approval Portal

### Sending for Approval

`'Send to client for approval'` button on each review queue post card.

On click: modal asking for client email. On submit:
1. Insert into `post_approval_tokens`
2. Send email via Resend: subject `'Post ready for your review — {client_name}'`, body with magic link to `/approve/{token}` (valid 48 hours)

### Public Approval Page: /approve/[token]

No login required. Verify token not expired, not already used.

Shows: client name · platform · full caption · carousel slides or reels script.

- **'Looks good — approve'** → update token status `'approved'` + notify agency
- **'I would like some changes'** → textarea for note → update token status `'changes_requested'` + save note + notify agency

### Review Queue Status Badges

| Status | Appearance |
|---|---|
| `pending` | amber `'Awaiting client approval'` |
| `approved` | green `'Client approved ✓'` |
| `changes_requested` | red `'Changes requested'` + client note |

Agency can approve without client sign-off. Health niche: show stronger warning if skipping client approval.

---

## Section 24 — Best Time to Post (Dynamic, AI-Derived)

When a client is saved or edited, automatically generate posting time recommendations. Store in `brand_profiles.best_time_json`. Track last generation in `best_time_updated_at`.

### Generation Prompt (web_search tool required)

```
"You are a social media strategist. Based on this client's profile,
determine the best times to post on each of their active platforms.

Client profile:
Niche: {niche} | Audience: {target_audience}
Location/market: {location} | Language: {language}
Active platforms: {platforms}

For each platform, reason from first principles about:
- When this specific target audience is most likely online
  based on their lifestyle and daily patterns
- What day of week fits their behaviour (work, commute, leisure)
- Cultural or seasonal factors for this market and language
- Platform-specific usage patterns for this audience type

Also search the web for current research on best posting times
for this specific niche and platform combination.

Return JSON only:
{
  platforms: [{
    platform: string,
    best_days: string[],
    best_time_windows: [{
      time: string,
      label: string,
      reason: string
    }],
    avoid: string,
    confidence: 'research-backed' | 'ai-derived',
    reasoning_summary: string
  }],
  upgrade_note: string
}"
```

Works for any niche — the AI reasons from the client profile, not a hardcoded list.

### Scheduler UI

When agency sets a date in `/calendar` or `/review`, show recommendation panel below date picker:
- Best day chips (clicking selects that day)
- Best time chips (clicking auto-fills time picker)
- `reasoning_summary` in small text
- Confidence badge: `'Research-backed'` or `'AI-derived'`
- Upgrade note about Meta connection

### Monthly Refresh

In the weekly cron: for each client where `best_time_updated_at` is older than 30 days, regenerate `best_time_json`.

### Phase 2 Upgrade

Once Meta connected, replace AI-derived recommendations with real `page_fans_online_per_day` data. Update `best_time_json` with `source: 'meta-analytics'`. UI is identical — only the data source changes.

---

## Section 25 — Non-Marketer Solo Mode

Triggered by signup mode selection (Section 5).

### Solo Mode Changes

- `agencies.mode = 'solo'`, `agencies.plan = 'solo'`
- Auto-create one client named after their business
- Simplified sidebar labels (Section 4)
- Hide `/clients` from navigation

### Plain Language Labels

| Marketing term | Solo mode label |
|---|---|
| Reach | People who saw your posts |
| Impressions | Total times your posts appeared |
| Engagement rate | % of viewers who interacted |
| Follower delta | New followers this period |
| Human score | Sounds natural |
| Hook score | Opening line strength |
| CTA score | Call to action quality |

### Monday Coaching Card

Generated by cron, stored in `intelligence_briefings`:

```
"You are a friendly social media coach giving a solo business owner
their Monday action plan.

Business: {niche}
Posts this week: {scheduled_posts_summary}
Recent performance: {internal_metrics_summary}

Give exactly 3 short bullet points:
1. One thing to do when a post goes live
2. One content observation (do more or less of something)
3. One simple platform tip for this week

Plain language. Friendly. Under 60 words total.
Write as if texting a business owner who is not a marketing expert.
No jargon whatsoever."
```

Shown prominently on solo dashboard every Monday.

---

## Section 26 — Partial Performance Feedback Loop

### Internal Signal Tracking

Track in `posts` table: `quality_score_avg` · `was_rewritten` · `rewrite_count`

- On rewrite: increment `rewrite_count`, set `was_rewritten: true`
- On approve: save average quality score

### Feeding Back into Generation

Before generating for a client, fetch last 20 approved posts with scores. Include in prompt:

```
"Previous posts for this client that scored highest (quality_score_avg > 7.5):
{high_scoring_posts}
Note any patterns in what works well and lean toward those
characteristics in new posts."
```

### Content Insights on Client Edit Page

Show a content insights box on `/clients/[id]/edit`:
- Average quality score badge
- Trend: improving · stable · declining (last 10 vs prior 10)
- Most approved themes
- Most rewritten themes
- Plain label: `'Content quality is: on track / improving / needs attention'`

---

## Section 27 — Basic Client-Facing Activity Report

Available in Phase 1 — internal data only.

### Report Content

- Period date range
- Posts generated · approved (+ approval rate %) · published
- Content pillars covered with frequency
- Average content quality score + trend
- Themes covered this period
- Top scoring posts by `quality_score_avg`

### PDF Generation

Via jsPDF. Header shows **agency name + logo** — not PostFlow branding (white-label for agency use).

Footer note:
> "Engagement data (reach, likes, follower growth) will be added to future reports once your social accounts are connected."

Once Meta connected in Phase 2, report automatically enriches with real data — no UI changes needed.

---

## Section 28 — Language Rules for Additional Languages

The `language_rules` table is the single place to add new language support. No code changes needed for new languages.

When a client's language has no rules in the table: skip language validation, show amber badge `'Language rules not configured'`, apply English banned calques as a fallback.

As the platform grows into new markets, add a row to `language_rules` — every client using that language gets full validation automatically.

---

## Appendix — Phase 2 Roadmap

Features requiring Meta API connection:

| Feature | What's needed |
|---|---|
| Real analytics (reach, impressions, engagement) | Meta Graph API + `instagram_manage_insights` |
| Audience-specific best time | `page_fans_online_per_day` endpoint |
| Follower growth tracking | `follower_count` daily breakdown |
| Per-post performance data | media insights endpoints |

Features for Phase 3:

| Feature | What's needed |
|---|---|
| Stripe billing | `stripe` SDK + webhook handler + customer portal |
| Direct Instagram publishing | `instagram_content_publish` permission + Meta App Review |
| Competitor benchmarking | Third-party social analytics API |
| Reels video editor integration | Third-party video API |

---

*PostFlow Master Specification — Phase 1*
*Reference this document throughout all build sessions.*
