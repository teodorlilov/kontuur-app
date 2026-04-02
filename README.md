# PostFlow

AI-powered social media content platform for marketing agencies. Generate, review, schedule, and publish posts across platforms — with built-in quality validation, client approval portals, and multi-client management.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database & Auth:** Supabase (PostgreSQL + Row Level Security + Auth)
- **AI:** Anthropic Claude API (claude-sonnet-4-5)
- **Styling:** Tailwind CSS 4, Lucide React icons
- **Email:** Resend
- **Charts:** Recharts
- **PDF:** jsPDF, pdf-parse

## Getting Started

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | App URL (default: `http://localhost:3000`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `RESEND_API_KEY` | Email service key |
| `CRON_SECRET` | Secret for scheduled jobs |
| `JINA_API_KEY` | Optional — website content extraction |

## Features

**Client Management** — Add clients with AI-powered onboarding. Auto-analyze brand voice from website or Instagram URL. Configure tone, audience, content pillars, and language rules.

**Post Generation** — Generate single posts, carousels, and reels scripts across Instagram, TikTok, LinkedIn, Twitter, and Pinterest. Theme-based generation using trending topics grounded in client sources.

**Quality Validation** — AI scoring for hooks, CTAs, and messaging. Language and tone compliance checks. Slop detection to flag generic AI output. Source attribution verification.

**Review Queue** — Centralized approval interface with batch operations. Edit posts before approval. Send batch approval emails to clients with 48-hour expiry tokens.

**Client Approval Portal** — Public token-based portal where clients can review and approve/reject posts without logging in.

**Content Calendar** — Monthly grid view with drag-to-schedule. Best posting time recommendations per platform. Batch scheduling from the review queue.

**Team & Settings** — Role-based access (admin/member). Invite team members via email. Agency profile and plan management.

**Analytics** — Engagement and reach metrics. Activity reports with PDF export.

## Project Structure

```
src/
├── ai/                  # AI pipeline (generation, research, validation, rewrite)
├── features/            # React UI feature modules
│   ├── auth/            # Login, signup, password setup
│   ├── clients/         # Client management & onboarding
│   ├── dashboard/       # Main dashboard
│   ├── generate/        # Post generation interface
│   ├── review/          # Review queue
│   ├── calendar/        # Content calendar
│   ├── settings/        # Account & team settings
│   └── sources/         # Research sources
├── components/          # Shared UI components (buttons, cards, layout)
├── app/                 # Next.js App Router
│   ├── (auth)/          # Public auth pages
│   ├── (dashboard)/     # Protected dashboard pages
│   ├── api/             # API routes
│   └── approve/         # Public approval portal
├── lib/                 # Server utilities (supabase, auth, data access)
├── types/               # TypeScript definitions (database, API, sources)
└── utils/               # Generic utilities
```

### Architecture

Three-layer separation:

- **`src/ai/`** — Pure AI logic. No UI dependencies. Prompts co-located in `*/prompts/`.
- **`src/features/`** & **`src/components/`** — React UI. Never imports from `src/ai/`.
- **`src/app/api/`** — Thin API route wrappers that bridge AI and UI layers.

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm start            # Start production server
npm run lint         # ESLint
npm run test         # Vitest
npm run test:watch   # Vitest watch mode
```

## Database

Uses Supabase with Row Level Security on all tables. Migrations live in `supabase/migrations/`.

Core tables: `agencies`, `users`, `clients`, `brand_profiles`, `posts`, `post_history`, `client_sources`, `source_excerpts`, `research_findings`, `approval_tokens`, `posting_schedules`.

## Deployment

Deploy on [Vercel](https://vercel.com) — set all environment variables in the Vercel dashboard and connect the Supabase project.
