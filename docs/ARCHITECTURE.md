# PostFlow — Technical Architecture

> **Session 0 — Read this before building anything.**
> This document defines the technical standards, folder structure, and implementation patterns for the entire PostFlow codebase. Every build session must follow these standards without exception.
>
> Paste this as your **very first message** to Claude Code. Do not build anything until you have confirmed you have read and understood every section.

---

## Part 1 — Project Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 with App Router (not Pages Router) |
| Language | TypeScript — strict mode enabled |
| Styling | Tailwind CSS — utility classes only, no custom CSS files except `globals.css` for base resets |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| AI | Anthropic Claude API (`claude-sonnet-4-5`) |
| Email | Resend |
| PDF | jsPDF |
| Charts | Recharts |
| Icons | Lucide React |
| Deployment | Vercel |

---

## Part 2 — Folder Structure

Enforce this exact structure. Never deviate from it.

```
postflow-app/
├── app/                              # Next.js App Router pages
│   ├── (auth)/                       # Auth route group
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (dashboard)/                  # Protected route group
│   │   ├── layout.tsx                # Sidebar + topbar layout
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx              # Client list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # AI onboarding interview
│   │   │   └── [id]/
│   │   │       └── edit/
│   │   │           └── page.tsx      # Edit client
│   │   ├── generate/
│   │   │   └── page.tsx
│   │   ├── review/
│   │   │   └── page.tsx
│   │   ├── calendar/
│   │   │   └── page.tsx
│   │   ├── analytics/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── team/
│   │       │   └── page.tsx
│   │       └── account/
│   │           └── page.tsx
│   ├── approve/
│   │   └── [token]/
│   │       └── page.tsx              # Public client approval page
│   ├── api/                          # API routes (server-side only)
│   │   ├── ai/
│   │   │   ├── generate/
│   │   │   │   └── route.ts          # Post generation
│   │   │   ├── validate/
│   │   │   │   └── route.ts          # Quality + language check
│   │   │   ├── research/
│   │   │   │   └── route.ts          # Trending topic research
│   │   │   ├── pillars/
│   │   │   │   └── route.ts          # Pillar suggestions
│   │   │   ├── onboard/
│   │   │   │   └── route.ts          # Profile generation
│   │   │   ├── best-time/
│   │   │   │   └── route.ts          # Best time recommendations
│   │   │   └── intelligence/
│   │   │       └── route.ts          # Weekly briefing
│   │   ├── clients/
│   │   │   ├── route.ts              # GET all, POST create
│   │   │   └── [id]/
│   │   │       └── route.ts          # GET one, PUT update, DELETE
│   │   ├── posts/
│   │   │   ├── route.ts              # GET all, POST create
│   │   │   └── [id]/
│   │   │       └── route.ts          # GET, PUT, DELETE
│   │   ├── approval/
│   │   │   ├── send/
│   │   │   │   └── route.ts          # Send approval email
│   │   │   └── [token]/
│   │   │       └── route.ts          # Handle client response
│   │   ├── reports/
│   │   │   └── route.ts              # Generate PDF report
│   │   └── cron/
│   │       └── generate/
│   │           └── route.ts          # Autonomous generation cron
│   ├── layout.tsx                    # Root layout
│   └── globals.css                   # Base styles only
│
├── components/                       # Reusable UI components
│   ├── ui/                           # Primitive components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── select.tsx
│   │   ├── badge.tsx
│   │   ├── card.tsx
│   │   ├── modal.tsx
│   │   ├── tabs.tsx
│   │   ├── toast.tsx
│   │   └── spinner.tsx
│   ├── layout/                       # Layout components
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   └── notifications-bell.tsx
│   ├── clients/
│   │   ├── client-card.tsx
│   │   ├── client-form.tsx
│   │   └── onboarding-chat.tsx
│   ├── generate/
│   │   ├── priority-post-form.tsx
│   │   ├── theme-row.tsx
│   │   ├── pillar-selector.tsx
│   │   ├── post-type-selector.tsx
│   │   ├── research-results.tsx
│   │   └── generation-progress.tsx
│   ├── posts/
│   │   ├── post-card.tsx
│   │   ├── carousel-slides.tsx
│   │   ├── reels-script.tsx
│   │   ├── quality-scores.tsx
│   │   ├── language-panel.tsx
│   │   └── slop-detector.tsx
│   ├── calendar/
│   │   ├── calendar-grid.tsx
│   │   ├── calendar-post-chip.tsx
│   │   └── best-time-panel.tsx
│   ├── analytics/
│   │   ├── metric-cards.tsx
│   │   ├── activity-report.tsx
│   │   └── phase2-placeholder.tsx
│   ├── intelligence/
│   │   └── briefing-card.tsx
│   └── approval/
│       └── approval-page.tsx
│
├── lib/                              # Shared utilities and logic
│   ├── supabase/
│   │   ├── client.ts                 # Browser Supabase client
│   │   ├── server.ts                 # Server Supabase client
│   │   └── middleware.ts             # Auth middleware helper
│   ├── anthropic/
│   │   ├── client.ts                 # Anthropic client setup
│   │   ├── prompts/                  # All AI prompts as functions
│   │   │   ├── generate-post.ts
│   │   │   ├── generate-carousel.ts
│   │   │   ├── generate-reels.ts
│   │   │   ├── validate-quality.ts
│   │   │   ├── validate-language.ts
│   │   │   ├── detect-slop.ts
│   │   │   ├── research-topics.ts
│   │   │   ├── suggest-pillars.ts
│   │   │   ├── generate-profile.ts
│   │   │   ├── best-time.ts
│   │   │   └── intelligence-briefing.ts
│   │   └── utils.ts                  # Shared AI helpers
│   ├── email/
│   │   └── resend.ts                 # Email sending functions
│   ├── pdf/
│   │   └── report.ts                 # PDF generation functions
│   └── utils/
│       ├── cn.ts                     # Tailwind class merging
│       ├── format.ts                 # Date, number formatting
│       └── constants.ts              # App-wide constants
│
├── hooks/                            # Custom React hooks
│   ├── use-clients.ts
│   ├── use-posts.ts
│   ├── use-notifications.ts
│   ├── use-auth.ts
│   └── use-agency.ts
│
├── types/                            # TypeScript type definitions
│   ├── database.ts                   # Supabase table types
│   ├── api.ts                        # API request/response types
│   └── index.ts                      # Re-exports
│
├── middleware.ts                     # Next.js middleware (auth guard)
├── vercel.json                       # Cron job config
├── .env.local                        # Environment variables (never commit)
├── .env.example                      # Template (committed to git)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Part 3 — TypeScript Standards

### Strict Mode

`tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

### Rules

- **Never** use `any` type. If the type is unknown use `unknown` and narrow it properly.
- **Always** define types for: API request bodies · API response shapes · component props · database row shapes.

### Database Types

Generate from Supabase and store in `types/database.ts`:

```bash
npx supabase gen types typescript --local > types/database.ts
```

Usage:

```typescript
import type { Database } from '@/types/database'

type Client = Database['public']['Tables']['clients']['Row']
type NewClient = Database['public']['Tables']['clients']['Insert']
```

### API Types

Define in `types/api.ts`:

```typescript
export interface GeneratePostRequest {
  clientId: string
  platform: string
  themes: Theme[]
  postType: 'single' | 'carousel' | 'reels'
  slideCount?: number
  selectedPillars: string[]
}

export interface GeneratePostResponse {
  posts: GeneratedPost[]
  errors?: string[]
}
```

---

## Part 4 — File and Component Standards

### Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Files | kebab-case | `post-card.tsx` |
| Components | PascalCase | `PostCard` |
| Functions | camelCase | `generatePost` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_SLIDE_COUNT` |
| Types/Interfaces | PascalCase | `GeneratedPost` |
| Database tables | snake_case | `post_history` |

### Component File Structure

Every component file follows this exact order:

```typescript
// 1. Imports — external first, internal second
import { useState } from 'react'
import { SomeExternalLib } from 'external-lib'
import { Button } from '@/components/ui/button'
import type { PostCard as PostCardType } from '@/types'

// 2. Types/interfaces for this component
interface PostCardProps {
  post: GeneratedPost
  onApprove: (id: string) => void
  onDiscard: (id: string) => void
}

// 3. Component function
export function PostCard({ post, onApprove, onDiscard }: PostCardProps) {
  // 3a. State
  const [isEditing, setIsEditing] = useState(false)

  // 3b. Derived values
  const qualityScore = post.qualityScores.human

  // 3c. Handlers
  function handleApprove() {
    onApprove(post.id)
  }

  // 3d. Return JSX
  return <div>...</div>
}
```

### Export Rules

- **Never** use default exports for components
- **Always** use named exports
- **Never** put business logic inside components — it belongs in API routes (server-side), custom hooks (client-side), or `lib/` utilities (pure functions)

---

## Part 5 — API Route Standards

Every API route must follow this exact pattern:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { YourRequestType } from '@/types/api'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Get agency context — NEVER trust client-sent agency_id
    const { data: userData } = await supabase
      .from('users')
      .select('agency_id')
      .eq('id', user.id)
      .single()
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Validate request body
    const body: YourRequestType = await request.json()
    if (!body.requiredField) {
      return NextResponse.json(
        { error: 'requiredField is required' },
        { status: 400 }
      )
    }

    // 4. Business logic
    const result = await doSomething(body)

    // 5. Return response
    return NextResponse.json({ data: result })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Security Rules for API Routes

- **Always** verify the user is authenticated
- **Always** verify the resource belongs to the user's agency before reading or writing
- **Never** trust client-sent `agency_id` — always derive it from the authenticated user
- **Always** use the server Supabase client in API routes, never the browser client

### Row Level Security

Enable RLS on **all** Supabase tables. Every table must have policies so users can only read and write their own agency's data. Provide RLS policy SQL alongside every table creation SQL.

---

## Part 6 — Supabase Client Usage

Two clients exist. Use the right one in the right place.

### Browser Client — `lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### Server Client — `lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: cookieStore.get.bind(cookieStore) } }
  )
}
```

### Usage Rules

| Use server client in | Use browser client in |
|---|---|
| API routes | Client Components |
| Server Components | Custom hooks |
| Middleware | — |

- **Never** import server client in Client Components
- **Never** import browser client in API routes

---

## Part 7 — Anthropic API Standards

### Client Setup — `lib/anthropic/client.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set')
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const DEFAULT_MODEL = 'claude-sonnet-4-5'
export const DEFAULT_MAX_TOKENS = 4096
```

### Prompt File Pattern

All AI prompts live in `lib/anthropic/prompts/` as individual typed functions:

```typescript
// lib/anthropic/prompts/generate-post.ts

import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '../client'
import type { GeneratePostInput, GeneratedPost } from '@/types'

export async function generateSinglePost(
  input: GeneratePostInput
): Promise<GeneratedPost> {
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [{ role: 'user', content: buildPrompt(input) }]
  })

  const text = response.content[0].type === 'text'
    ? response.content[0].text
    : ''

  return parseResponse(text)
}

function buildPrompt(input: GeneratePostInput): string {
  return `...prompt text using ${input.clientName}...`
}

function parseResponse(text: string): GeneratedPost {
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    throw new Error('Failed to parse AI response')
  }
}
```

### Web Search Pattern

When a prompt requires current information:

```typescript
const response = await anthropic.messages.create({
  model: DEFAULT_MODEL,
  max_tokens: DEFAULT_MAX_TOKENS,
  tools: [{
    type: 'web_search_20250305',
    name: 'web_search'
  }],
  messages: [{ role: 'user', content: prompt }]
})

// Extract text from potentially mixed content blocks
const text = response.content
  .filter(block => block.type === 'text')
  .map(block => block.type === 'text' ? block.text : '')
  .join('')
```

### AI Rules

- **Never** call the Anthropic API directly from components
- **Never** call the Anthropic API directly from API routes — always call the function from `lib/anthropic/prompts/`
- **Always** call AI from server-side code only (API routes)
- **Always** handle JSON parsing errors gracefully
- **Always** use the `DEFAULT_MODEL` constant — never hardcode the model string
- **Never** make AI API calls in parallel without limiting concurrency — max 3 concurrent calls

---

## Part 8 — Data Fetching Patterns

### Server Components (default)

Use for initial page data that does not need interactivity:

```typescript
// app/(dashboard)/clients/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function ClientsPage() {
  const supabase = createServerSupabaseClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('*, brand_profiles(*)')
    .order('created_at', { ascending: false })

  return <ClientList clients={clients ?? []} />
}
```

### Custom Hooks for Interactive Data

```typescript
// hooks/use-posts.ts
'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { Post } from '@/types'

export function usePosts(clientId: string) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPosts() {
      try {
        const supabase = createBrowserSupabaseClient()
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
        if (error) throw error
        setPosts(data ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchPosts()
  }, [clientId])

  return { posts, loading, error }
}
```

### Mutations from Client Components

Never call Supabase directly for mutations from components. Use `fetch()` to call your own API routes:

```typescript
async function handleApprove(postId: string) {
  const response = await fetch(`/api/posts/${postId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' })
  })
  if (!response.ok) throw new Error('Failed to approve post')
  const { data } = await response.json()
  return data
}
```

### Loading and Error States

Every data fetch must handle three states: `loading` (spinner/skeleton) · `error` (message + retry) · `success` (data). Never leave users staring at a blank screen.

---

## Part 9 — State Management

Do **not** install Redux, Zustand, or any state management library. Use this hierarchy:

| Layer | Use for |
|---|---|
| URL state | Shareable state — active tab, selected client, date range. Use Next.js `searchParams`. |
| Local component state | UI-only state — modal open, form values, loading flags. Use `useState`. |
| Custom hooks | Shared data fetching state — `usePosts`, `useClients`. |
| React Context | Truly global state only — auth user, agency info, user mode. One context per concern. |

### Global Contexts to Create

- `AuthContext` — current user + agency data
- `ModeContext` — `'agency'` or `'solo'`, affects navigation and UI labels throughout the app

Never put server data in client-side global state. Fetch it server-side in Server Components instead.

---

## Part 10 — Error Handling

### Three Layers

**Layer 1 — API routes:** always return structured errors

```typescript
return NextResponse.json(
  { error: 'Descriptive message', code: 'ERROR_CODE' },
  { status: 400 }
)
```

**Layer 2 — Client fetches:** always catch and display

```typescript
try {
  const data = await fetchSomething()
  setData(data)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  toast.error(message)
}
```

**Layer 3 — Component boundaries:** add `error.tsx` files for route segments that could fail silently.

### Toast Notification Standards

| Type | Colour | Example |
|---|---|---|
| Success | green | `'Post approved successfully'` |
| Error | red | Specific message, never just `'Error'` |
| Info | blue | `'Generating your posts...'` |
| Warning | amber | `'This post may read as AI-generated'` |

Never use `alert()`. Never use `console.log()` in production. Use `console.error()` only for unexpected errors in catch blocks.

---

## Part 11 — Environment Variables

### Rules

| Variable | Exposure |
|---|---|
| `ANTHROPIC_API_KEY` | Server only — never `NEXT_PUBLIC_` |
| `META_APP_SECRET` | Server only |
| `RESEND_API_KEY` | Server only |
| `CRON_SECRET` | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Safe as public — designed to be |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe as public — designed to be |
| `NEXT_PUBLIC_APP_URL` | Safe as public |

Validate env vars at startup in `lib/anthropic/client.ts` and `lib/supabase/server.ts` — throw clear errors if missing.

Commit `.env.example` with all keys listed but no values. Never commit `.env.local`.

---

## Part 12 — Security Rules

These are non-negotiable:

1. **Row Level Security** — every Supabase table has RLS policies. No exceptions.
2. **Agency isolation** — in every API route, verify the requested resource belongs to the user's agency. Never trust client-sent IDs alone.
3. **Public routes** — only `/login`, `/signup`, and `/approve/[token]` are public. Everything else requires authentication via middleware.
4. **Token expiry** — approval tokens expire after 48 hours. Check expiry before processing any token request.
5. **API key protection** — Anthropic, Resend, and Meta secret keys only ever used in server-side code. If any appear in a Client Component that is a critical security bug.
6. **Input validation** — validate all API request bodies before processing. Never pass raw user input directly to database queries or AI prompts without sanitisation.

### Middleware

```typescript
// middleware.ts
export { default } from '@/lib/supabase/middleware'

export const config = {
  matcher: [
    '/((?!login|signup|approve|api/approval|_next|favicon).*)'
  ]
}
```

---

## Part 13 — Performance Standards

1. **Server Components by default.** Only add `'use client'` when a component needs `useState`, `useEffect`, event handlers, browser APIs, or third-party client libs.
2. **Loading states** — every page must have a `loading.tsx` sibling for automatic Suspense boundaries.
3. **Images** — use Next.js `<Image>` component for all images. Never use raw `<img>` tags.
4. **Cron jobs** — `/api/cron/generate` must complete within Vercel's function time limit. Process clients in batches if needed.
5. **AI calls** — never make AI API calls in parallel without limiting concurrency. Maximum 3 concurrent calls to avoid rate limiting.
6. **Database queries** — always select only the columns you need. Never use `select('*')` in production queries unless you genuinely need all columns.

---

## Part 14 — Code Quality Rules

1. **Single responsibility** — every function does one thing. If a function is over 30 lines it probably needs to be split.

2. **No magic numbers** — extract into named constants in `lib/utils/constants.ts`:
   ```typescript
   // BAD
   if (posts.length > 50)
   // GOOD
   if (posts.length > MAX_POST_HISTORY_COUNT)
   ```

3. **Meaningful names** — variable names explain intent:
   ```typescript
   // BAD
   const d = new Date()
   // GOOD
   const scheduledPublishDate = new Date()
   ```

4. **Comments explain why, not what:**
   ```typescript
   // BAD
   // increment counter
   count++

   // GOOD
   // Meta requires a 1-second delay between consecutive
   // Graph API calls to avoid rate limiting
   await sleep(1000)
   ```

5. **Prompt files** — every AI prompt is in its own file in `lib/anthropic/prompts/`. Prompt text is never inline in a component or API route.

6. **DRY** — if the same logic appears in two places, extract it to a shared utility in `lib/utils/`.

---

## Part 15 — Git Workflow

### Commit Message Format

```
feat: add client approval portal
fix: carousel quality check not resetting on rewrite
refactor: extract AI prompts to lib/anthropic/prompts
style: update post card quality score colours
```

### Branch Naming

```
feat/client-approval-portal
fix/carousel-quality-check
refactor/ai-prompts
```

### `.gitignore` Must Include

```
.env.local
.env.*.local
node_modules/
.next/
.vercel/
```

---

## Part 16 — Build Order Within Each Session

At the start of each session, always build in this order:

1. **Type definitions** first (`types/database.ts` and `types/api.ts`)
2. **Utility functions** and AI prompt files (`lib/`)
3. **API route** (`app/api/`)
4. **Hooks** if needed (`hooks/`)
5. **UI components** bottom-up — primitives first, then composed components (`components/`)
6. **Page** that assembles everything (`app/(dashboard)/...`)

This order ensures every piece exists before it is needed. Building the page first and filling gaps leads to import errors and confusion.

---

## Confirmation Required

Read everything above carefully, then reply with:

1. Confirmation you have read and understood the full architecture document
2. Any questions about ambiguous points before building begins
3. The first three files you will create in Session 1 — to confirm you understand the structure

**Do not start building yet.** Wait for confirmation that we are ready to begin Session 1.

---

*PostFlow Technical Architecture — Session 0*
*Reference this alongside every build session.*
