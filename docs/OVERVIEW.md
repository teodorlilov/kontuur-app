# Kontuur — Product & Architecture Overview

> **This is the single source of truth for what Kontuur is and how it is built.**
> It is generated from the actual code (not the planning docs) and describes every
> feature implemented in the codebase as of this writing.
>
> Historical planning docs (the "PostFlow" build prompts) live in [`archive/`](./archive/).
> Feature-specific implementation plans live in [`plans/`](./plans/).
> See [`README.md`](./README.md) for the full documentation index.

> **Note on naming:** the product is **Kontuur** (kontuur.app). The npm package,
> repo folder, and some internal identifiers are still named `postflow` — that is the
> legacy name and is being phased out. They refer to the same product.

---

## 1. What Kontuur is

Kontuur is an **AI-powered social media content platform for marketing agencies** (and
solo business owners). It takes a client from onboarding to published post with AI doing
the heavy lifting at every stage: it learns each client's brand, researches on-topic
ideas grounded in the client's own sources, writes platform-native posts, validates them
for quality and language authenticity, routes them through client approval, schedules
them on a calendar, and auto-publishes to Instagram.

It supports two operating modes, chosen at signup and stored on the agency:

| Mode | For | Navigation |
| ---- | --- | ---------- |
| **Agency** | Teams managing social for multiple clients | Dashboard · Clients · Generate posts · Review queue · Calendar · Client ideas · Analytics · Settings |
| **Solo** | A single business managing its own socials | Dashboard · Create content · My drafts · My calendar · My results · Settings |

Solo mode auto-creates one client for the business and simplifies the language and
navigation throughout.

### The content lifecycle

```
Onboard client ──► Configure brand profile + research sources
       │
       ▼
Research (Tavily web + client RSS/website/file sources, grounded per content pillar)
       │
       ▼
Generate (single posts / carousels, source-grounded, N candidates per theme)
       │
       ▼
Validate (quality + language, multi-dimensional scores, auto-correction, slop + source checks)
       │
       ▼
Review queue ──► optional Client approval portal (public magic link)
       │
       ▼
Calendar (schedule + best-time recommendations) ──► attach images (upload / Canva)
       │
       ▼
Auto-publish to Instagram (Meta Graph API) via daily cron
       │
       ▼
Analytics + weekly AI intelligence briefing
```

This whole loop can also run **autonomously**: a daily cron generates a review queue for
every client on an active posting schedule, and a second cron publishes everything that
is due.

---

## 2. Tech stack

| Layer | Technology |
| ----- | ---------- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4, Radix UI primitives, Framer Motion, Lucide icons |
| Toasts | Sonner |
| Database / Auth / Storage | Supabase (PostgreSQL + Row Level Security + Auth + Storage) |
| AI | Anthropic Claude — `claude-sonnet-4-5` (default) + `claude-haiku-4-5` (light tasks) |
| Email | Resend |
| Charts | Recharts |
| PDF | jsPDF (report export), pdf-parse (source file extraction) |
| Publishing | Meta Graph API (Instagram / Facebook) |
| Design import | Canva Connect API |
| Research | Tavily (web trend search), Jina AI Reader (website content extraction) |
| Hosting / Cron | Vercel |
| Tests | Vitest |

---

## 3. Architecture

Kontuur follows a strict **three-layer separation**. The dependency rule is one-directional:
UI never imports AI logic directly; everything crosses through a **server boundary** — an API
route handler or a server action (`src/features/*/actions/`).

```
┌─────────────────────────────────────────────────────────────┐
│  src/features/  +  src/components/     React UI              │
│  (never imports from src/ai/)                               │
└───────────────┬─────────────────────────────────────────────┘
                │  fetch()  /  server actions
                ▼
┌─────────────────────────────────────────────────────────────┐
│  src/app/api/  +  features/*/actions/   Thin server boundary │
│  auth via resolveAuth(); bridge UI ↔ AI                      │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  src/ai/              Pure AI logic — no UI dependencies      │
│  prompts co-located in each pipeline's  */prompts/  folder   │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  src/lib/  +  src/utils/   Supabase clients, auth, queries,  │
│  source fetching, Anthropic wrapper, shared helpers          │
└─────────────────────────────────────────────────────────────┘
```

### Route groups (`src/app/`)

| Group | Access | Purpose |
| ----- | ------ | ------- |
| `(marketing)` | public | Landing page, pricing, privacy, terms, data-deletion |
| `(auth)` | public | Login, signup, forgot / setup password |
| `(onboarding)` | authed | New-client AI interview |
| `(dashboard)` | authed | Dashboard, clients, review, calendar, ideas, analytics, settings |
| `(generate)` | authed | Full-screen generation wizard |
| `(public)` | token-based | Client approval portal + client idea submission (no login) |

### Data-fetching rule (UI → server)

Two idioms exist; pick by this rule, not by habit:

- **Server actions** (`src/features/*/actions/`) — the default for simple, authenticated
  mutations and reads initiated from our own UI.
- **API routes** (`src/app/api/`) — required when the endpoint is **streaming**
  (`ai/generate-stream`), **public/token-authed** (approval portal, idea submission),
  or called by **cron, webhooks, or OAuth callbacks** (Meta, Canva).

Existing `fetch('/api/…')` calls that fall in the first bucket are legacy; migrate them to
server actions opportunistically when touching the file — no big-bang rewrite.

### Auth model

- **`src/middleware.ts`** refreshes the Supabase session on all non-API page requests.
  API routes are **excluded** from middleware — each route authenticates itself via
  `resolveAuth()` (`src/lib/auth/`) to avoid a double `getUser()` per request.
- Multi-tenancy is enforced with **Row Level Security** on every table, scoped by the
  authenticated user's `agency_id`. Tables keyed by `client_id` join through `clients`
  to resolve the agency.
- Server routes that must bypass RLS (cron jobs, storage, public token flows) use an
  **admin Supabase client** (`src/lib/supabase/admin.ts`) and manually scope every query
  to the correct agency/client.

### The Anthropic wrapper (`src/utils/ai-client.ts`)

All model calls go through `callAnthropic()`, which centralizes:

- **Model selection** — `DEFAULT_MODEL` (`claude-sonnet-4-5`) for generation/validation,
  `LIGHT_MODEL` (`claude-haiku-4-5`) for extraction tasks (pillars, sources, best-time, URL analysis).
- **Prompt caching** — system prompts are sent with `cache_control: ephemeral` by default.
- **Structured output** — an optional `outputSchema` forces tool-use so the model returns
  schema-valid JSON with no parsing needed; `sanitizeAndParseJson` + `jsonrepair` handle
  the free-text fallback path.
- **Streaming** — token callbacks for live generation UIs.
- **Resilience** — automatic retry with exponential backoff on `529 overloaded` errors.

---

## 4. Directory map

```
src/
├── ai/                          # Layer 3 — pure AI logic
│   ├── generation/              #   post + carousel generation pipeline (orchestrator, generators, prompts)
│   ├── research/                #   source fetching + topic generation (polymorphic sources: rss/website/file)
│   ├── validation/              #   quality + language scoring, correction, slop, source grounding
│   ├── rewrite/                 #   targeted post rewrite from feedback
│   ├── onboard/                 #   brand profile generation from interview
│   ├── analyze-url/             #   bootstrap a profile from a website / Instagram URL
│   ├── suggest-sources/         #   recommend research sources for a client
│   ├── best-time/               #   best posting-time recommendations
│   ├── intelligence/            #   weekly agency briefing
│   ├── solo-coaching/           #   solo-mode Monday coaching card
│   ├── analytics/               #   AI summary of a reporting period
│   ├── shared/                  #   deduplicator, prompt sections, content criteria, formality
│   └── utils/                   #   prompt helpers, sanitisation
│
├── app/
│   ├── (marketing) (auth) (onboarding) (dashboard) (generate) (public)   # route groups
│   └── api/                     # Layer 2 — route handlers (ai, clients, posts, approval,
│                                #   ideas, meta, canva, analytics, settings, sources, cron, auth)
│
├── features/                    # Layer 1 — feature-scoped React modules
│   ├── auth clients dashboard generate review calendar ideas
│   ├── analytics settings sources publishing onboarding marketing
│   └── (each: components/ + hooks/ + actions/ + lib/ + types)
│
├── components/                  # Shared UI — ui/ primitives, layout/, posts/, scheduling/, providers/
├── lib/                         # Server utils — supabase/, auth/, queries/, sources/, clients/, email/,
│                                #   meta/ (Graph API constants + IG/FB metrics fetching & aggregation)
├── utils/                       # Generic helpers + ai-client (Anthropic wrapper)
├── types/                       # database.ts (generated), api.ts, post.ts, sources.ts
├── hooks/  i18n/  middleware.ts
│
supabase/migrations/             # SQL migrations (source of truth for schema changes)
docs/                            # this documentation
```

---

## 5. Data model

The schema is defined in `src/types/database.ts` (generated from Supabase) with migrations
in `supabase/migrations/`. Nineteen tables, grouped by domain:

### Tenancy & identity
| Table | Purpose |
| ----- | ------- |
| `agencies` | Tenant root. Holds `mode` (agency/solo), `plan`, `plan_client_limit`, `timezone`, `trial_ends_at`, and Stripe billing fields (scaffolding). |
| `users` | App user linked to an `agency_id` with a `role` (admin/member). Mirrors the Supabase auth user. |

### Clients & brand
| Table | Purpose |
| ----- | ------- |
| `clients` | A managed brand: `name`, `niche`, `language`, `posts_per_week`, `website_url`, `contact_email`. |
| `brand_profiles` | 1:1 with a client. Tone, target audience, content pillars, formality, secondary language, avoid-topics, health-niche flag, default post type + carousel slide count, `source_strategy`, `weekly_mix_json`, and cached `best_time_json`. |
| `client_sources` | Research inputs per client — type `rss` / `website` / `file` / `tavily`, with fetch status, extracted text, source summary, and `pillar_ids` mapping the source to content pillars. |
| `language_rules` | Per-language authenticity ruleset (Bulgarian + English seeded): banned anglicisms, banned calques, formality rules, native CTA phrases, opener examples. |

### Generation
| Table | Purpose |
| ----- | ------- |
| `generation_runs` | One row per generation batch (client + platform). |
| `generation_themes` | Themes within a run — description, post count, priority flag/brief, target date, whether research was used. Also feeds dedup history. |
| `posts` | The core content record. Caption, `slides_json` (carousels), `platform`, `post_type`, `pillar`, `status`, `priority`, `quality_score_avg`, `validation_json`, source attribution, `scheduled_at`, and publishing fields (`ig_media_id`, `ig_creation_id`, `published_at`, `publish_attempts`, `publish_error`, `rewrite_count`). |
| `post_images` | Ordered images attached to a post (Supabase Storage path + public URL). |
| `post_history` | Rolling topic summaries per client used to deduplicate future generations. |

### Review, approval & ideas
| Table | Purpose |
| ----- | ------- |
| `post_approval_tokens` | Public approval links (48h expiry), batchable, tracking `status`, client email/note, `responded_at`. |
| `notifications` | In-app agency notifications (client approvals, change requests) with unread state and optional feedback. |
| `client_ideas` | Ideas submitted by clients via a public form — links a `token_id`, target date, status, and the resulting `generated_post_id`. |
| `idea_form_tokens` | Per-client public link that lets a client submit ideas without logging in. |

### Scheduling, publishing & connections
| Table | Purpose |
| ----- | ------- |
| `posting_schedules` | Autonomous generation config per client — active flag, frequency, `auto_generate_day`/`time`. Drives the generate cron. |
| `social_connections` | OAuth connections (Instagram/Facebook) — account id/name, access + refresh tokens, expiry. |

### Insights
| Table | Purpose |
| ----- | ------- |
| `analytics_reports` | Stored reports per client/platform/period — `metrics_json` + AI `ai_summary`. |
| `intelligence_briefings` | Weekly per-agency briefing — platform updates, trending topics, weekly tip, action nudge, sources, and solo `coaching_points`. |

Plus an RPC: **`client_post_stats(p_agency_id)`** returns per-client `total_count`,
`published_count`, and `last_generated_at` in one round-trip for the dashboard/client grid.

---

## 6. The AI pipeline

Every pipeline lives under `src/ai/` with its prompts co-located. The four that matter most:

### Research (`src/ai/research/`)
`ResearchPipeline.execute()` orchestrates:
1. Load client data (brand profile, post history, generation-theme history, used source URLs).
2. Instantiate **polymorphic sources** via a factory — `RssResearchSource`, `WebsiteResearchSource`,
   `FileResearchSource` — and fetch them all in parallel; `tavily` runs as a separate web trend search.
3. Skip content pillars that have no eligible sources; allocate topic budget by pillar weight.
4. Generate grounded topic ideas with the LLM, tagging each with the source's eligible pillars.
5. Filter LLM-hallucinated topics (a topic must carry a real source URL, unless it's a file source),
   deduplicate against history, and attach full source text for downstream grounding.

### Generation (`src/ai/generation/`)
`GenerationPipeline.execute()`:
1. Builds a theme list (priority posts first, then researched themes) and attaches
   similar past themes via the `Deduplicator` (angle-similarity threshold).
2. Processes themes in batches of **5 concurrent** LLM calls (`Promise.allSettled` — one
   theme failing never sinks the batch).
3. For **single** posts it generates several candidates per theme, validates each, and keeps
   the best above `QUALITY_FLOOR` (falling back to the top scorer if none qualify).
   For **carousels** it generates the deck and validates the whole thing.
4. Applies text/slide corrections from validation and emits a draft record with scores attached.

### Validation (`src/ai/validation/`)
`validatePost()` runs **two LLM calls in parallel** — quality and language — then computes
a multi-dimensional score set:

- **Quality criteria:** niche fit, audience match, pillar match, theme adherence, hook verdict,
  CTA verdict, structure checks, AI tells, brand-voice match, formality consistency,
  health compliance, and source-claim flags.
- **Scores:** `brief`, `craft`, `voice`, `source`, `language` (+ naturalness & register sub-scores),
  `human`, and a weighted `overall_score`.
- **Auto-correction:** language fixes are applied to caption and slides; when text is corrected,
  language sub-scores normalise to 10 so the score stays consistent.
- **Slop detection** is derived from the human score, AI tells, and the worst offending phrase.
- **Source grounding** is verified only when a source excerpt was supplied.

The `overall_score` is written to `posts.quality_score_avg`; posts below `QUALITY_FLOOR` are
discarded before an agency ever sees them.

### Rewrite (`src/ai/rewrite/`)
Targeted rewrite of an existing post from reviewer feedback, incrementing `posts.rewrite_count`.

---

## 7. Feature catalog (implemented)

**Accounts & teams** — Supabase email/password auth; agency/solo signup; email-based team
invites with a setup-password flow; forgot-password; auth rate limiting; role-based access
(admin/member).

**AI client onboarding** — Conversational interview → AI-generated brand profile. `analyze-url`
can bootstrap a profile from a website or Instagram URL. Editable review step before save;
creates the `clients`, `brand_profiles`, and `posting_schedules` rows and kicks off best-time
generation.

**Brand profiles & content pillars** — Full editable brand settings; content pillars with
per-pillar source mapping; language + formality controls; health-niche compliance flag.

**Research sources** — Per-client RSS feeds, crawled websites (sitemap/subpage discovery via
Jina), uploaded files (PDF/text, extracted + summarised), and Tavily web search. A stepper
wizard and sources manager handle discovery, pillar assignment, and strategy toggles.

**Post generation** — Single posts and carousels across Instagram, Facebook, LinkedIn,
X/Twitter, and TikTok. Theme-based, source-grounded, deduplicated, with a streaming wizard,
priority posts, and "generate from a client idea."

**Quality & language validation** — Every post scored on the dimensions above, with language
authenticity enforced from the `language_rules` table and automatic correction of anglicisms,
calques, and register slips. Slop detector and source-attribution verification surface in the UI.

**Review queue** — Filter by pending/approved/priority; inspect scores, slides, and source
grounding; edit before approving; approve/discard; batch operations; rewrite from feedback.

**Client approval portal** — Public, no-login token page (48h expiry). Clients approve or
request changes with a note; the agency is notified in-app. Approval emails (single + batch)
are sent via Resend.

**Client ideas** — A per-client public form (token link) lets clients submit post ideas without
logging in. Ideas land in a dashboard page, filterable by client, and can be turned into a post
in one click.

**Content calendar** — Monthly grid with scheduling (FAB + unscheduled panel), best-time
recommendations per platform, batch scheduling from review, and client-response cards. Calendar
images are preloaded for snappy navigation.

**Images & Canva** — Attach images to a post by direct upload or by importing a Canva design
(user-level Canva Connect OAuth → list designs → export to an image slot). Images are stored in
Supabase Storage and ordered per post.

**Instagram publishing** — Meta Graph API two-step flow (create container → poll → publish) for
single images and 2–10-image carousels, with token-expiry checks and up to 3 retry attempts.
Meta OAuth connect, connection management, profile-picture fetch, and a data-deletion callback
are all implemented.

**Autonomous operation** — A daily generate cron researches + generates + validates a review
queue for every client on an active schedule (and refreshes stale best-times, weekly briefings,
and solo coaching). A daily publish cron pushes every due scheduled post to Instagram.

**Intelligence & coaching** — Weekly per-agency briefing (platform updates, niche trends, weekly
tip, action nudge, sources); on-demand tips; solo-mode Monday coaching card.

**Analytics & reports** — Overview / posts / audience tabs with Recharts (follower trend, media-type
breakdown, top posts, post-day breakdown), an AI summary strip, report history, and PDF export
via jsPDF. Backed by the `client_post_stats` RPC and `analytics_reports`.

**Dashboard** — Stat cards, client rows with pending counts, the intelligence briefing, change-request
cards, quick actions, and recent post previews (agency and solo variants).

**Notifications & settings** — Notification bell with unread badge; settings for account, profile,
team (invite/members), integrations (Canva/Meta), plan, and a danger zone.

**Marketing site** — Public landing page (hero, features, how-it-works, pricing, social proof, CTA,
footer), plus privacy, terms, and data-deletion pages, `sitemap.ts`, and `robots.ts`.

---

## 8. Integrations & external services

| Service | Used for | Key env |
| ------- | -------- | ------- |
| Anthropic Claude | All generation, validation, research, briefings | `ANTHROPIC_API_KEY` |
| Supabase | Database, auth, storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Meta Graph API | Instagram/Facebook publishing + OAuth | `META_APP_ID`, `META_APP_SECRET` |
| Canva Connect | Import designs as post images | `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI` |
| Resend | Approval + invite emails | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Tavily | Web trend search during research | `TAVILY_API_URL_KEY` |
| Jina AI Reader | Website content extraction | `JINA_API_KEY` (optional) |
| Vercel | Hosting + cron | `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` |

> Instagram publishing depends on Meta App Review for three Instagram permissions — see the
> project memory and Meta developer console for current review status.

---

## 9. Background jobs (Vercel Cron)

Configured in `vercel.json`, both authenticated with `Authorization: Bearer $CRON_SECRET`:

| Endpoint | Schedule | Does |
| -------- | -------- | ---- |
| `GET /api/cron/generate` | daily `0 9 * * *` | For each active posting schedule due today: research → generate → validate → save `pending_review` → notify agency → refresh stale best-time. Then one weekly intelligence briefing per agency (+ solo coaching). `maxDuration: 300s`. |
| `GET /api/cron/publish` | daily `0 9 * * *` | Publish every post with `status='scheduled'` whose time is due (5-min window), grouped by client, to Instagram; retry up to 3 attempts. `maxDuration: 60s`. |

---

## 10. API surface

All under `src/app/api/`. Representative map (each handler authenticates and scopes to the agency):

- **AI** — `ai/onboard`, `ai/analyze-url`, `ai/suggest-sources`, `ai/generate-stream`,
  `ai/generate-from-idea`, `ai/rewrite`, `ai/detect-slop`, `ai/best-time`, `ai/intelligence`,
  `ai/intelligence/tip`
- **Clients** — `clients`, `clients/[id]`, `clients/[id]/sources` (+ `/tavily`, `/upload`, `/[sourceId]`)
- **Sources** — `sources/discover`
- **Posts** — `posts`, `posts/[id]`, `posts/[id]/images`, `posts/[id]/publish`
- **Approval & ideas** — `approval/send`, `approval/email`, `approval/[token]`,
  `ideas`, `ideas/submit`, `ideas/token`
- **Meta** — `meta/connect`, `meta/callback`, `meta/connections`, `meta/connections/[id]`,
  `meta/profile-picture`, `meta/data-deletion`
- **Canva** — `canva/connect`, `canva/callback`, `canva/status`, `canva/team-status`,
  `canva/designs`, `canva/designs/[designId]/export`
- **Analytics** — `analytics/report`, `analytics/report/[reportId]`
- **Settings** — `settings/account`, `settings/team`, `settings/team/invite`
- **Auth** — `auth/signup`, `auth/forgot-password`
- **Cron** — `cron/generate`, `cron/publish`

---

## 11. Environment variables

See [`.env.example`](../.env.example) for the authoritative list with comments. Summary:

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` ·
`ANTHROPIC_API_KEY` · `META_APP_ID` · `META_APP_SECRET` · `RESEND_API_KEY` · `RESEND_FROM_EMAIL` ·
`NEXT_PUBLIC_APP_URL` · `CRON_SECRET` · `JINA_API_KEY` · `TAVILY_API_URL_KEY` ·
`CANVA_CLIENT_ID` · `CANVA_CLIENT_SECRET` · `CANVA_REDIRECT_URI`

Rule: anything without the `NEXT_PUBLIC_` prefix is server-only and must never reach the client.

---

## 12. Testing & tooling

- **Vitest** — unit tests co-located in `__tests__/` folders across `ai/research`, `ai/validation`,
  `ai/rewrite`, `ai/shared`, `lib/sources`, `lib/clients`, `features/review`, and `utils`.
- **Scripts** — `npm run dev | build | start | lint | test | test:watch`, plus `format` / `format:check`.
- **Type safety** — TypeScript strict mode; `npx tsc --noEmit` is the gate for changes.

---

## 13. Deployment

Deploys on **Vercel**. Set all environment variables in the Vercel dashboard, point Supabase
Auth redirect URLs at the deployed domain, and the two cron jobs run automatically per
`vercel.json`. Row Level Security must be enabled on all Supabase tables in production.

---

## 14. Documentation index

| Doc | What it is | Status |
| --- | ---------- | ------ |
| **OVERVIEW.md** (this file) | Product + architecture + full feature catalog | **Current — start here** |
| [STYLE-GUIDE.md](./STYLE-GUIDE.md) | Kontuur design system (colours, type, spacing, components) | Current |
| [CLAUDE.md](./CLAUDE.md) | Code-quality rules (DRY, single source of truth, function limits) | Current |
| [CODING_SKILLS.md](./CODING_SKILLS.md) | LLM coding-behaviour guidelines | Current |
| [plans/PUBLISHING.md](./plans/PUBLISHING.md) | Instagram publishing implementation plan | Shipped |
| [plans/NOTIFICATION.md](./plans/NOTIFICATION.md) | Client-response notification plan | Shipped |
| [plans/CLIENT_IDEAS.md](./plans/CLIENT_IDEAS.md) | Client ideas feature plan | Shipped |
| [plans/AI-GENERATED_TEMPLATES.md](./plans/AI-GENERATED_TEMPLATES.md) | AI brand-template image generation | Proposed (not built) |
| [archive/MASTER_PROMPT.md](./archive/MASTER_PROMPT.md) | Original "PostFlow" build spec | Historical |
| [archive/ARCHITECTURE.md](./archive/ARCHITECTURE.md) | Original "PostFlow" Session-0 architecture | Historical (superseded by this file) |
| [archive/SESSIONS.md](./archive/SESSIONS.md) | Original 9-session build plan | Historical |

---

## 15. Known gaps / roadmap

- **Billing** — Stripe fields exist on `agencies` but billing is scaffolding, not wired up.
- **Publishing reach** — auto-publish targets Instagram; other platforms are generated/scheduled
  but not auto-published.
- **Meta App Review** — live Instagram publishing/analytics depend on approved Meta permissions.
- **AI-generated post imagery** — proposed in `plans/AI-GENERATED_TEMPLATES.md`; images today are
  uploaded or imported from Canva.
