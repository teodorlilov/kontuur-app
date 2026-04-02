================================================================
POSTFLOW AGENCY — MASTER BUILD PROMPT FOR CLAUDE CODE
================================================================
Paste this entire document as your first message to Claude Code.
Have your Supabase URL, Supabase anon key, and Anthropic API key
ready — Claude Code will ask for them during setup.
================================================================


I am building a SaaS platform called PostFlow for social media
marketing agencies. The platform allows agencies to manage multiple
clients, generate AI-written social media posts using the Anthropic
Claude API, review and approve posts, schedule them on a content
calendar, and generate analytics reports per client.

Scaffold the complete project using:
- Next.js 14 (App Router)
- TypeScript
- Supabase (database + authentication)
- Tailwind CSS (styling)
- Anthropic Claude API (AI generation, research, validation)
- Recharts (charts in analytics)
- jsPDF (PDF export)

================================================================
SECTION 1 — AUTHENTICATION
================================================================

- Agencies sign up and log in with email + password via Supabase Auth
- Sign up flow: email, password, agency name
  → creates row in agencies table + users table
- After login, redirect to /dashboard
- Protect all routes — unauthenticated users redirect to /login
- Team member invite: admin can invite colleagues by email
  from /settings/team. Invited users get role: 'member'

================================================================
SECTION 2 — DATABASE SCHEMA
================================================================

Run this SQL in the Supabase SQL editor after scaffolding.

-- AGENCIES
create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text default 'free',
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
  is_health_niche boolean default false
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

-- SOCIAL CONNECTIONS (for analytics)
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

-- Seed Bulgarian language rules
insert into language_rules (language, banned_anglicisms, banned_calques, native_cta_phrases, formality_default)
values (
  'Bulgarian',
  '[
    {"wrong": "свайпни", "correct": "плъзни / виж следващото"},
    {"wrong": "лайкни", "correct": "хареса ли ти?"},
    {"wrong": "шеърни", "correct": "сподели"},
    {"wrong": "сейвни", "correct": "запази публикацията"},
    {"wrong": "фолоуни", "correct": "последвай ни"},
    {"wrong": "тагни", "correct": "отбележи"},
    {"wrong": "букни", "correct": "запази час"},
    {"wrong": "постни", "correct": "публикувай"},
    {"wrong": "стори", "correct": "история"},
    {"wrong": "риийлс", "correct": "видео"}
  ]',
  '[
    "Открийте силата на",
    "Трансформирайте вашия",
    "Отключете потенциала",
    "Издигнете своя",
    "В днешния свят"
  ]',
  '{
    "carousel_swipe": ["Плъзни надясно →", "Виж следващото →", "Продължи →", "Разлисти →"],
    "book_appointment": ["Запази час", "Запиши се за консултация", "Свържи се с нас", "Пиши ни"],
    "engagement": ["Разпознаваш ли се?", "Случвало ли ти се е?", "Какво мислиш?", "Сподели в коментар"]
  }',
  'neutral'
);

-- Seed English language rules
insert into language_rules (language, banned_anglicisms, banned_calques, native_cta_phrases, formality_default)
values (
  'English',
  '[]',
  '[
    "Discover the power of",
    "Unlock your potential",
    "Transform your",
    "Elevate your",
    "In today''s world",
    "We are proud to announce",
    "We are excited to share",
    "Take your X to the next level"
  ]',
  '{
    "carousel_swipe": ["Swipe to see more →", "Keep reading →", "See what''s inside →", "Swipe through →"],
    "book_appointment": ["Book a consultation", "Get in touch", "Reserve your spot", "Schedule a call"],
    "engagement": ["Can you relate?", "Has this happened to you?", "What do you think?", "Share in the comments"]
  }',
  'neutral'
);

================================================================
SECTION 3 — ENVIRONMENT VARIABLES
================================================================

Create .env.local with:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
META_APP_ID=
META_APP_SECRET=

================================================================
SECTION 4 — NAVIGATION AND LAYOUT
================================================================

Sidebar layout used on all authenticated pages.

Sidebar links:
- Dashboard (/dashboard)
- Clients (/clients)
- Generate (/generate) — label: "Generate posts"
- Review (/review) — show unread count badge
- Calendar (/calendar)
- Analytics (/analytics)
- Settings (/settings)

Top navbar:
- Page title (left)
- Bell icon with unread notifications count (right)
- Clicking bell opens a dropdown of recent notifications

Notification dropdown shows:
- Message text
- Time ago
- Mark as read on click

Styling:
- Clean minimal professional design
- Purple accent: #534AB7
- Sidebar background: slightly off-white / dark in dark mode
- Fully responsive

================================================================
SECTION 5 — PAGE: /login and /signup
================================================================

/login — email + password form using Supabase Auth
/signup — email, password, agency name
  → on submit: create Supabase auth user, insert agencies row,
    insert users row linked to new agency

================================================================
SECTION 6 — PAGE: /dashboard
================================================================

Show:
- 4 stat cards: active clients, posts pending review,
  posts scheduled this week, total published all time
- Client list: each row shows name, niche,
  pending post count as a badge
- Prominent "Review X pending posts" button if count > 0

================================================================
SECTION 7 — PAGE: /clients
================================================================

List all clients for the logged-in agency.
Each row: client name, niche, posts per week, platforms, 
pending posts badge, Edit button.

"+ Add client" button links to /clients/new

================================================================
SECTION 8 — SMART CLIENT ONBOARDING: /clients/new
================================================================

Replace a standard form with a two-stage AI interview flow.

--- STAGE 1: AI CHAT INTERVIEW ---

Show a chat-style UI with an AI avatar (✦).
Show a progress bar: Step X of 6.
Ask these questions one at a time with quick-reply chips:

Q1: "What does your client actually do?
     Describe it like you would tell a friend."

Q2: "Who are their ideal customers?
     Think about who actually buys from them —
     age, lifestyle, what they care about."

Q3: "What is the main goal for their social media?
     Getting new customers, building trust and authority,
     keeping existing ones engaged — or a mix?"
Quick replies: Get new customers / Build trust and authority /
Both — attract and educate / Keep existing clients engaged

Q4: "How should their posts sound?
     Think about how they talk to customers in real life."
Quick replies: Warm and reassuring / Professional and elegant /
Educational and informative / Friendly and casual

Q4b: "What language should posts be written in?
      And should the tone be formal, neutral, or casual?"
Quick replies: Bulgarian — formal / Bulgarian — neutral /
Bulgarian — casual / English — neutral / English — casual /
Other — I will type it

Q5: "Anything they absolutely do not want on their social media?
     Sensitive topics, things to avoid, off-limits subjects."

Q6: "Last one — how would a happy client describe this business
     to a friend? Just one sentence, in their words."

After all 6 answers, call the Anthropic Claude API:

System: "You are a social media strategist."
User: "Based on these answers from a marketing agency about
their client, generate a complete social media brand profile.

Answers:
Q1 - What the business does: {answer1}
Q2 - Ideal customers: {answer2}
Q3 - Social media goals: {answer3}
Q4 - Brand tone: {answer4}
Q4b - Language and formality: {answer4b}
Q5 - Topics to avoid: {answer5}
Q6 - Client testimonial voice: {answer6}

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
}"

--- STAGE 2: PROFILE REVIEW ---

Display generated profile in sections:
- Niche (with niche_reasoning in a tinted box)
- Target audience (chips)
- Social media goals (chips)
- Content pillars (chips, with content_pillars_reasoning below)
- Brand tone (paragraph)
- Topics to avoid
- Recommended platforms (with reasoning)
- Client testimonial voice
- Autonomous schedule (editable dropdowns — see Section 11)

Every section has an inline Edit button.

If is_health_niche is true, show a yellow notice:
"This is a health-related client. All generated posts will
include medical content safety instructions. Human review
is mandatory before any post is published."

"Confirm and save client" saves to:
- clients table
- brand_profiles table
- posting_schedules table (with defaults)

"Redo interview" restarts Stage 1.

================================================================
SECTION 9 — PAGE: /clients/[id]/edit
================================================================

Full edit form for all brand profile fields:
- Client name, niche, language, language formality
- Brand tone (textarea)
- Target audience (textarea)
- Content pillars (textarea)
- Topics to avoid (textarea)
- Client testimonial voice (textarea)
- Posts per week (number)
- Default post type (single / carousel)
- Default carousel slide count
- Weekly content mix (carousel per week + single per week)
- Platform pill selectors:
  Instagram / Facebook / LinkedIn / X/Twitter / TikTok
- Autonomous schedule section (see Section 11)
- Connected accounts section (Meta OAuth — see Section 13)
- is_health_niche toggle

================================================================
SECTION 10 — PAGE: /generate
================================================================

Multi-step generation flow. Steps shown in a progress bar.

--- STEP 1: CLIENT AND PLATFORM ---

- Client dropdown (loads all agency clients)
- Platform dropdown: Instagram / Facebook / LinkedIn /
  X/Twitter / TikTok
- Selecting client auto-loads their brand_profile

--- STEP 2: PRIORITY POSTS ---

"Priority posts this week" section above themes.
"+ Add priority post" button adds a row with:
- Title field (e.g. "Spring promotion — 20% off fillers")
- Brief field (what the post must say or promote)
- Platform selector
- Target date picker

Priority posts are generated first.
Flagged in posts table with priority: true.
Shown with a red "Priority" badge in the review queue.

--- STEP 3: WEEKLY THEMES ---

Dynamic list of theme rows. Each row:
- Text input for theme description
- Number input for post count (default 1)
- Remove button (×)

"+ Add theme" button adds a new row.
Running total: "Total posts: X" updates live.

"Research trending topics for me" button:
→ Calls Anthropic Claude API with web_search tool:
  "Search the web for what is trending right now in {niche}
   on social media in {language}-speaking markets.
   Focus on: popular content formats, seasonal topics,
   viral post angles, relevant news.
   Return exactly 5 findings as JSON:
   [{ finding: string, suggested_theme: string }]"
→ Display results as a list.
→ Each finding has "Use as theme" button that adds it
  to the theme list.

--- STEP 4: CONTENT PILLARS ---

Show client's content_pillars as selectable chip buttons.
All selected by default. Agency can deselect for this run.

"Suggest more pillars" button calls Claude:
  "Suggest 6 content pillar ideas for a {niche} account.
   Return JSON: [{ pillar: string }]"
Suggestions appear as dashed chips. Clicking one adds it
permanently to the client's brand_profile content_pillars.

--- STEP 5: POST TYPE (Instagram only) ---

When Instagram is selected, show post type selector:
- Single image post (default — pre-filled from client default)
- Carousel post

When Carousel selected, show slide count input
(default: client's default_carousel_slides, min 3, max 10).

For non-Instagram platforms, always use single post type.

--- STEP 6: GENERATION ---

"Generate posts" button triggers generation for each theme.

For SINGLE IMAGE posts use this prompt:

"You are a senior social media copywriter at a top creative
agency. You write for humans, not algorithms. Your posts
sound like they were written by a real person who knows
this business deeply.

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

Recent topics already covered — do not repeat these angles:
{post_history_last_50}

LANGUAGE RULES:
Write as a native {language} speaker writing naturally
for social media — not as a translation from English.

BANNED anglicisms for {language}: {banned_anglicisms}
BANNED calque constructions: {banned_calques}
For CTAs use only these approved native phrases: {native_cta_phrases}
Use {language_formality} address consistently. Never mix
formal and informal address in the same post.

WRITING RULES:
1. OPENER: Never start with a generic statement.
   Open with: a question naming a specific feeling,
   a counterintuitive statement, a specific detail,
   or a direct second-person line about right now.

2. SENTENCE VARIETY: Mix short and long. Every post must
   have at least one sentence under 6 words and one over 20.
   Never three consecutive sentences of similar length.

3. BANNED PHRASES: Never use Discover, Unlock, Transform,
   Elevate, Journey, 'We are proud to', 'We are excited to',
   'In today's world', 'Did you know?' as opener,
   'Book now and...', 'The power of'.

4. CTA: One per post maximum. Specific and low-pressure.
   Not 'Book now!' but 'A consultation is a good place
   to start.'

5. HASHTAGS by platform:
   Instagram: max 3, niche-specific or location-based,
   place at end after line break.
   Facebook: max 1-2, only if tied to specific event,
   default none.
   LinkedIn: 3-5 professional niche hashtags.
   X/Twitter: 1-2 only for trending topics.
   Prioritise keyword-rich captions over hashtags.
   Never use generic hashtags (#love #beautiful #instagood).

6. PLATFORM WORD COUNT:
   Instagram: 150-220 words max
   Facebook: up to 300 words
   LinkedIn: 200-350 words, professional, no emoji
   X/Twitter: under 280 characters, one strong idea

7. HEALTH/MEDICAL (if is_health_niche is true):
   All content educational and general only.
   Never promise outcomes. Never state specific dosages
   as absolute. Always frame as 'consult a professional'
   for individual decisions.

Write {count} post(s) for theme '{theme_description}'.
Separate multiple posts with ---.
Each post must feel distinctly different in structure
and angle from the others."

---

For CAROUSEL posts use this prompt:

"You are a senior social media copywriter creating an
Instagram carousel post for a marketing agency.

CLIENT BRIEF:
Client: {client_name}
Niche: {niche}
Theme: {theme_description}
Tone: {tone}
Target audience: {target_audience}
Language: {language}
Formality: {language_formality}
Number of slides: {slide_count}
Topics to avoid: {avoid_topics}
Client voice: '{client_testimonial_voice}'

Recent topics already covered: {post_history_last_50}

LANGUAGE RULES:
Write as a native {language} speaker.
BANNED anglicisms: {banned_anglicisms}
BANNED calques: {banned_calques}
For carousel swipe cues use ONLY these approved phrases:
{native_cta_phrases.carousel_swipe}
Never invent swipe phrases. Always pick from the list above.
Use {language_formality} address consistently.

CAROUSEL STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop
  the reader must swipe to resolve. Add an approved swipe
  cue phrase. No body text.
- Slides 2 to (n-2): Content slides. One distinct idea per
  slide. Headline + 2-3 sentence body. Self-contained.
- Slide (n-1): Value/payoff slide. Emotional or informational
  peak. Where the promise of Slide 1 is fulfilled.
- Last slide: CTA only. Low-pressure. One question or
  invitation. Include a CTA button text suggestion.

SLIDE QUALITY RULES:
1. Every headline must contain: a specific number/stat,
   a named tension the reader recognises, or a
   counterintuitive specific claim.
   NEVER: topic labels ('Hydration', 'SPF', 'Tips'),
   generic positives ('Good skincare is important').

2. Body text must add NEW information beyond the headline.
   Minimum 2 sentences. Never restate the headline.

3. Each slide covers a DISTINCT idea — check previous
   slides before writing each new one.

4. BANNED phrases on all slides: Discover, Unlock,
   Transform, Elevate, Journey, 'We are proud',
   'We are excited', 'In today's world'.

5. HEALTH CLIENTS: Educational only. No medical claims.
   No promised outcomes. Always recommend consulting
   a professional.

FOR EACH SLIDE PROVIDE a design note (1-2 sentences)
telling the Canva designer what visual treatment to use.

MAIN CAPTION (separate from slides):
- Max 3 lines, teases the carousel without revealing it
- Ends with an approved swipe cue from the list above
- 1-3 niche-specific hashtags at the end

Return JSON only:
{
  main_caption: string,
  slides: [
    {
      slide_number: number,
      slide_role: 'cover' | 'content' | 'value' | 'cta',
      headline: string,
      body: string,
      cta_text: string | null,
      design_note: string
    }
  ]
}"

--- CONTENT QUALITY VALIDATION ---

After generating each post (single or carousel), run a
second API call to score quality:

For single posts:
"Rate this social media post on three criteria.
Return JSON only:
{
  human_score: number 1-10,
  hook_score: number 1-10,
  cta_score: number 1-10,
  issues: [{ type: string, description: string }]
}
Post: {generated_post}"

For carousel posts:
"You are a strict social media content quality checker.
Evaluate each slide against these rules and return a
JSON quality report.

Rules per slide:
- headline_specific: headline contains specific claim,
  number, or named tension (not a generic topic label)
- body_adds_value: body adds NEW information beyond headline
- no_filler: no zero-information statements
- no_banned_phrases: free of: Discover, Unlock, Transform,
  Elevate, Journey, 'We are proud', 'We are excited'
- not_duplicate: covers different idea from all prior slides
- medical_safe: no specific medical claims (health clients)

Return JSON only:
{
  overall_pass: boolean,
  slides_passing: number,
  slides_total: number,
  slides: [
    {
      slide_number: number,
      status: 'pass' | 'warn' | 'fail',
      scores: { specificity: number, hook_strength: number,
                info_density: number },
      issues: [{ rule: string, problem: string,
                 suggestion: string }]
    }
  ]
}"

--- LANGUAGE VALIDATION ---

After every generation, run a language validation call:

"You are a native {language} language editor reviewing
social media copy for professional quality.

Check for:
1. ANGLICISMS: English words written in target language
   script. Flag each + provide native alternative.
2. CALQUES: Grammatically correct but clearly translated
   from English sentence patterns. Flag + suggest rewrite.
3. GRAMMAR ERRORS: Wrong conjugations, gender agreement,
   case endings, punctuation. Flag each + correction.
4. FORMALITY CONSISTENCY: Formal or informal address used
   consistently — never mixed in the same post.
5. REGISTER: Naturalness score 1-10.

Text: {generated_text}
Language: {language}
Configured formality: {language_formality}

Return JSON only:
{
  passes: boolean,
  naturalness_score: number 1-10,
  issues: [
    {
      type: 'anglicism'|'calque'|'grammar'|'formality'|'register',
      original_text: string,
      issue_description: string,
      suggested_fix: string
    }
  ],
  corrected_text: string | null
}"

--- POST CARD UI ---

Each generated post card shows:
- Client name, theme tag, platform tag, post type tag
- For carousels: "🎠 Carousel · N slides" badge
- Main caption (with Copy button)
- For carousels: slide tab bar (Cover / Slide 2... / Last)
  - Each slide shows: headline, body, CTA text, design note
  - Each slide has individual Copy button
  - "Copy all slides" button copies full deck to clipboard
    formatted for pasting into Canva text boxes
- Quality scores (human, hook, CTA)
- Language validation panel with "Apply all fixes" button
- For carousels: per-slide quality dots (green/amber/red)
  on tab labels
- Action buttons: Approve / Edit inline / Rewrite / Discard

Approve gate for carousels: if overall_pass is false,
Approve button is disabled. Show "Approve anyway" link.

Health client notice on every post card if is_health_niche:
"Please verify all health-related information before
approving this post."

"Rewrite this slide" button on carousel quality panel:
- Optional instruction textarea
- Triggers single-slide regeneration API call:
  "Rewrite only slide {n}.
   Original: {slide_content}
   Issues to fix: {issues_list}
   Agency instructions: {agency_note}
   Apply all carousel and language rules.
   Return JSON: { headline, body, cta_text, design_note }"
- Replace only that slide in slides_json
- Re-run validation on updated slide

Saving approved posts:
- status: 'approved', saved to posts table
- topic_summary saved to post_history

"Send all approved to review queue" sets status:
'pending_review' for the review page.

================================================================
SECTION 11 — AUTONOMOUS POSTING SCHEDULE
================================================================

On /clients/[id]/edit, "Autonomous schedule" section:

- Toggle: Autonomous mode on/off (posting_schedules.is_active)
- Frequency:
  1/week / 2/week / 3/week / 4/week / 5/week /
  4/month / 8/month / 12/month
- Auto-generate day: day of week dropdown
- Auto-generate time: time picker

Default content mix:
- Carousel posts per week (number input)
- Single image posts per week (number input)
- Default carousel slide count (3/4/5/6/7/8/10)

Recommended content mix hint shown below inputs:
"For Instagram, carousels drive the highest engagement.
Recommended: 2 carousels + 1 single per week."

--- CRON JOB: /api/cron/generate ---

Create this API route.

When called:
1. Fetch all clients where posting_schedules.is_active = true
2. For each, check if today matches auto_generate_day
3. If yes, read weekly_mix_json from brand_profiles
4. Generate the correct number of each post type using
   the standard generation prompts from Section 10
5. Use post_history_last_50 to avoid topic repetition
6. Save posts to posts table with status 'pending_review'
7. Insert notification:
   "New posts ready to review for {client_name}
    — {count} posts generated automatically."

Create vercel.json in project root:
{
  "crons": [
    {
      "path": "/api/cron/generate",
      "schedule": "0 9 * * 1"
    }
  ]
}

================================================================
SECTION 12 — PAGE: /review
================================================================

List all posts with status 'pending_review' or 'approved'
across all clients for the logged-in agency.

Filter tabs: All / Pending / Approved / Priority

Each post card shows:
- Priority badge (red) if priority: true — always at top
- Client name, platform, post type
- Caption preview (truncated, expandable)
- For carousels: show slide count and "View slides" toggle
- Status badge
- Action buttons:
  Approve (→ status: 'approved') /
  Edit caption inline /
  Request rewrite (→ status: 'draft') /
  Schedule (opens date-time picker → status: 'scheduled')

Health client posts show a yellow "Health content — review
carefully" banner before the action buttons.

================================================================
SECTION 13 — PAGE: /calendar
================================================================

Monthly calendar grid view.

Show approved and scheduled posts on their scheduled_at date.
Each post: small coloured chip with client name.
Client colours: assign a consistent colour per client
(cycle through purple/teal/amber/blue/green).

Clicking a post opens a side panel:
- Full caption
- For carousels: all slides in tabs
- Date/time picker to schedule
  (sets scheduled_at, status: 'scheduled')
- Platform selector
- Save button

Navigation: Prev month / Next month buttons.

================================================================
SECTION 14 — META OAUTH: /api/auth/meta
================================================================

On /clients/[id]/edit add "Connected accounts" section with:
- "Connect Instagram" button
- "Connect Facebook Page" button

OAuth flow:
1. Redirect to Meta OAuth with permissions:
   instagram_basic, instagram_manage_insights,
   pages_read_engagement, pages_show_list, read_insights
2. On callback (/api/auth/meta/callback):
   Save to social_connections table:
   client_id, platform, account_id, account_name,
   access_token, token_expires_at

Use META_APP_ID and META_APP_SECRET from .env.local.

================================================================
SECTION 15 — PAGE: /analytics
================================================================

- Client selector (only clients with a social_connection)
- Date range picker (default: last 30 days)
- Platform tabs: Instagram / Facebook
- "Generate report" button
- "Export PDF" button

--- DATA FETCHING ---

When "Generate report" is clicked, call Meta Graph API:

Instagram:
- Account: followers_count, follows_count, media_count
- Insights (date range): reach, impressions, profile_views,
  follower_count daily breakdown
- Per post in period: id, caption, timestamp, media_type,
  like_count, comments_count, saved, reach, impressions

Facebook:
- Page: fan_count, followers_count
- Insights (date range): page_impressions, page_reach,
  page_engaged_users, page_views_total
- Per post: message, created_time, reactions, comments,
  shares, reach, impressions

Save to analytics_reports table:
- metrics_json: full raw metrics
- ai_summary: generated by Claude (see below)

--- AI SUMMARY PROMPT ---

"You are a social media analyst writing a report summary
for a marketing agency.

Given these metrics for {client_name}'s {platform} account
for {start_date} to {end_date}, write a concise 4-5 sentence
summary covering:
- Overall performance trend
- Best performing content type or post and why
- Audience or engagement insight worth highlighting
- One specific actionable recommendation for next period

Professional tone, flowing prose, no bullet points.
Metrics: {metrics_json}"

--- REPORT UI ---

1. Header: client name, platform, date range, Export PDF
2. Four metric cards:
   Followers (+ change vs previous period) /
   Total reach / Avg engagement rate / Posts published
3. AI summary in purple-tinted box
4. Two horizontal bar charts (Recharts):
   - Reach by content type
   - Top audience cities
5. Top performing posts:
   Caption preview / reach / engagement rate

--- PDF EXPORT ---

Use jsPDF to generate downloadable PDF containing:
- Agency and client name header
- Date range
- All key metrics
- AI summary text
- Top performing posts list

--- REPORT HISTORY ---

Below the report generator, show "Previous reports"
listing all saved reports for selected client:
- Date generated
- Platform
- "View report" button reloads from saved metrics_json

================================================================
SECTION 16 — PAGE: /settings
================================================================

/settings/team:
- List team members (users with same agency_id)
- "Invite team member" form: email input
  → Supabase auth invite email
- Show role badge (admin / member)

/settings/account:
- Agency name edit
- Plan display

================================================================
SECTION 17 — STYLING GUIDELINES
================================================================

- Tailwind CSS throughout
- Purple accent: #534AB7 (buttons, active states, badges)
- Clean minimal professional design
- Sidebar fixed, content scrollable
- Cards: subtle border, soft background, rounded corners
- Status badges:
  Pending: amber background
  Approved: green background
  Scheduled: blue background
  Published: gray background
  Priority: red background
- Health client elements: yellow/amber tinted backgrounds
- Quality scores:
  Pass (green dot): #1D9E75
  Warn (amber dot): #EF9F27
  Fail (red dot): #E24B4A
- Fully responsive (mobile sidebar collapses to hamburger)

================================================================
SECTION 18 — RECOMMENDED CONTENT MIX GUIDANCE
================================================================

Show a subtle guidance panel on /generate for Instagram:

"Recommended weekly mix based on 2026 engagement data:
 Carousels → highest engagement (10% avg engagement rate,
 3.4× more saves than single images)
 Reels → best for reach and new audience discovery
 Single images → promotions, announcements, quotes
 Suggested mix: 2 carousels + 1 single per week"

================================================================
SECTION 19 — BUILD ORDER
================================================================

Please build in this order:

1. Project setup: Next.js 14, TypeScript, Tailwind, Supabase
2. Authentication (/login, /signup, route protection)
3. Database: provide complete SQL to run in Supabase
4. Layout: sidebar, topbar, notifications bell
5. /dashboard
6. /clients — list page
7. /clients/new — smart onboarding (AI interview)
8. /clients/[id]/edit — full edit form
9. /generate — full multi-step generation flow
   including research, priority posts, themes,
   pillar selection, post type selector,
   single and carousel generation,
   quality validation, language validation
10. /review
11. /calendar
12. /analytics + Meta OAuth
13. /settings
14. Autonomous cron job (/api/cron/generate + vercel.json)

Tell me when you need environment variable values.
Provide the complete SQL block at Step 3 for me to run
in the Supabase SQL editor.

================================================================
END OF MASTER PROMPT
================================================================