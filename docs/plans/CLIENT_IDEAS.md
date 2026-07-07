# Client Ideas Feature — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> This is a new feature. No existing files are modified except where explicitly stated.
> The generate wizard receives a new entry point but its core pipeline is unchanged.

---

## Overview

This feature allows the social media manager to send a unique link to each client.
The client opens the link — no login required — and submits post ideas via a simple form.
Ideas appear in a dedicated "Client ideas" page in the dashboard, filterable by client.
The manager can generate a post directly from any idea with one click.

**Four parts:**

1. **Public idea form** — `kontuur.app/ideas/[token]` — client-facing, no auth
2. **Client ideas page** — `/ideas` in the dashboard — inbox with filtering
3. **Client settings tab** — "Idea form" tab showing the link + submitted ideas
4. **Generate wizard integration** — "Generate from this idea" skips to Step 3 with pre-filled context

---

## Database

```sql
-- New table: idea_form_tokens
-- One row per client — a permanent unique link
CREATE TABLE idea_form_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  token        TEXT NOT NULL UNIQUE,   -- e.g. "dr-kamberova-a8f3c2"
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- New table: client_ideas
CREATE TABLE client_ideas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  token_id     UUID NOT NULL REFERENCES idea_form_tokens(id),
  idea_text    TEXT NOT NULL,
  extra_notes  TEXT,                   -- optional: anything specific to include
  platform     TEXT,                   -- optional: 'Instagram' | 'Facebook' etc
  target_date  TEXT,                   -- optional: free text "dd / mm / yyyy"
  status       TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'generating' | 'generated' | 'dismissed'
  generated_post_id UUID REFERENCES posts(id),  -- set when generated
  submitted_at TIMESTAMPTZ DEFAULT now(),
  read_at      TIMESTAMPTZ             -- null = unread by agency
);
```

> **Find actual naming convention first:**
> ```bash
> find src -name "*.ts" | xargs grep -l "workspace_id\|workspaceId" | head -5
> cat src/lib/db.ts   # or equivalent schema file
> ```

---

## File Structure

| File | Change |
|---|---|
| `src/app/(public)/ideas/[token]/page.tsx` | CREATE — client form (no auth) |
| `src/app/(public)/ideas/[token]/success/page.tsx` | CREATE — thank-you page |
| `src/app/(public)/layout.tsx` | CREATE — bare public layout |
| `src/app/(dashboard)/ideas/page.tsx` | CREATE — ideas inbox |
| `src/components/ideas/idea-card.tsx` | CREATE — single idea card |
| `src/components/ideas/idea-filter-bar.tsx` | CREATE — client + status filters |
| `src/components/client-settings/idea-form-tab.tsx` | CREATE — link + ideas preview in client settings |
| `src/app/api/ideas/submit/route.ts` | CREATE — POST endpoint (public) |
| `src/app/api/ideas/route.ts` | CREATE — GET (list) + PATCH (status update) |
| `src/lib/ideas.ts` | CREATE — DB helpers |
| `src/app/(dashboard)/generate/page.tsx` | UPDATE — accept `ideaId` query param |
| `src/components/generate/wizard-topbar.tsx` | UPDATE — show context banner when `ideaId` present |

---

## Design Tokens

```
Public form header:   background #1A2630 (slate), rings decoration
Form card:            background #fff, border 0.5px var(--border), border-radius 13px
Idea label:           #C07B55 terracotta, 9px uppercase, letter-spacing 1.2px
Platform pills:       same as wizard — active: slate bg, inactive: muted border

Dashboard page title: "Client ideas" — Playfair Display, same topbar pattern
Client filter pills:  same style as existing platform pills in generate wizard
Status pills:         same style — New / All / Used
Idea card:            white, 0.5px border, 10px radius — matches existing card style
New dot indicator:    7px circle, background #C07B55, left of client name
"Generate" button:    background #1A2630 (slate) → hover #C07B55
Context banner:       background #fff, border-bottom 0.5px, 10px 28px padding
  Client pill:        rgba(44,62,80,0.07) bg
  Platform pill:      rgba(192,123,85,0.12) bg, #C07B55 text
  Idea pill:          rgba(44,94,138,0.08) bg, #2C5F8A text, truncated
Stage 2 label in gen: "Applying client idea as brief" (not "Selecting source articles")
```

---

## Step 1 — DB helpers

> **File:** `src/lib/ideas.ts`

```typescript
export async function getOrCreateToken(
  workspaceId: string,
  clientId:    string,
  clientSlug:  string   // e.g. "dr-kamberova" — used in the URL
): Promise<string> {
  const supabase = await createServerSupabaseClient()
  const { data: existing } = await supabase
    .from('idea_form_tokens')
    .select('token')
    .eq('client_id', clientId)
    .single()

  if (existing) return existing.token

  // Create new token: "slug-6randomchars"
  const random = Math.random().toString(36).slice(2, 8)
  const token  = `${clientSlug}-${random}`

  await supabase.from('idea_form_tokens').insert({
    workspace_id: workspaceId,
    client_id:    clientId,
    token,
  })

  return token
}

export async function getClientByToken(
  token: string
): Promise<{ clientId: string; clientName: string; workspaceId: string; agencyName: string } | null> {
  const supabase = createPublicSupabaseClient()   // no auth — public route
  const { data } = await supabase
    .from('idea_form_tokens')
    .select('client_id, clients(name), workspace_id, workspaces(name)')
    .eq('token', token)
    .single()
  if (!data) return null
  return {
    clientId:    data.client_id,
    clientName:  data.clients.name,
    workspaceId: data.workspace_id,
    agencyName:  data.workspaces.name,
  }
}

export async function submitIdeas(
  tokenId:     string,
  workspaceId: string,
  clientId:    string,
  ideas: Array<{
    ideaText:   string
    extraNotes: string
    platform:   string
    targetDate: string
  }>
): Promise<void> {
  const supabase = createPublicSupabaseClient()
  await supabase.from('client_ideas').insert(
    ideas.map(i => ({
      workspace_id: workspaceId,
      client_id:    clientId,
      token_id:     tokenId,
      idea_text:    i.ideaText,
      extra_notes:  i.extraNotes || null,
      platform:     i.platform || null,
      target_date:  i.targetDate || null,
    }))
  )
}

export async function getIdeasForWorkspace(
  workspaceId: string,
  filters?: {
    clientId?: string
    status?:   'new' | 'generated' | 'dismissed'
  }
): Promise<ClientIdea[]> {
  const supabase = await createServerSupabaseClient()
  let query = supabase
    .from('client_ideas')
    .select('*, clients(name, niche)')
    .eq('workspace_id', workspaceId)
    .order('submitted_at', { ascending: false })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)
  if (filters?.status === 'new')       query = query.eq('status', 'new')
  if (filters?.status === 'generated') query = query.eq('status', 'generated')
  if (filters?.status === 'dismissed') query = query.eq('status', 'dismissed')

  const { data } = await query
  return (data ?? []).map(mapIdea)
}

export async function updateIdeaStatus(
  ideaId:      string,
  workspaceId: string,
  status:      'new' | 'generating' | 'generated' | 'dismissed',
  postId?:     string
): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase
    .from('client_ideas')
    .update({
      status,
      ...(postId ? { generated_post_id: postId } : {}),
      ...(status === 'generated' ? {} : {}),
    })
    .eq('id', ideaId)
    .eq('workspace_id', workspaceId)
}

export async function markIdeasRead(
  workspaceId: string,
  ideaIds:     string[]
): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase
    .from('client_ideas')
    .update({ read_at: new Date().toISOString() })
    .in('id', ideaIds)
    .eq('workspace_id', workspaceId)
    .is('read_at', null)
}

function mapIdea(row: any): ClientIdea {
  return {
    id:          row.id,
    clientId:    row.client_id,
    clientName:  row.clients?.name ?? 'Client',
    ideaText:    row.idea_text,
    extraNotes:  row.extra_notes,
    platform:    row.platform,
    targetDate:  row.target_date,
    status:      row.status,
    generatedPostId: row.generated_post_id,
    submittedAt: new Date(row.submitted_at),
    readAt:      row.read_at ? new Date(row.read_at) : null,
  }
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `getOrCreateToken` — returns existing token if one exists, creates once
- [ ] `getClientByToken` — uses public (unauthenticated) Supabase client
- [ ] `submitIdeas` — uses public client (no session required)
- [ ] `getIdeasForWorkspace` — filters work correctly

---

## Step 2 — Public API route

> **File:** `src/app/api/ideas/submit/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getClientByToken, submitIdeas } from '@/lib/ideas'

export async function POST(req: Request) {
  const body = await req.json()
  const { token, ideas } = body

  if (!token || !Array.isArray(ideas) || ideas.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Validate: at least one idea has idea_text
  if (ideas.some(i => !i.ideaText?.trim())) {
    return NextResponse.json({ error: 'Brief required' }, { status: 400 })
  }

  const client = await getClientByToken(token)
  if (!client) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }

  // Get token id
  const supabase = createPublicSupabaseClient()
  const { data: tokenRow } = await supabase
    .from('idea_form_tokens')
    .select('id')
    .eq('token', token)
    .single()

  await submitIdeas(tokenRow.id, client.workspaceId, client.clientId, ideas)

  return NextResponse.json({ ok: true })
}
```

> **Rate limiting:** This is a public endpoint. Add basic rate limiting —
> max 10 submissions per token per hour. Use a simple in-memory counter
> or Supabase row count check before inserting.

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] POST with valid token and ideas → 200 `{ ok: true }`
- [ ] POST with invalid token → 404
- [ ] POST with missing idea_text → 400
- [ ] No auth required — public endpoint

---

## Step 3 — Public layout

> **File:** `src/app/(public)/layout.tsx`

```typescript
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F4EF' }}>
      {children}
    </div>
  )
}
```

No auth check. No dashboard sidebar. No topbar.

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `/ideas/[token]` renders without any dashboard chrome
- [ ] Dashboard routes unchanged — `(dashboard)` layout not affected

---

## Step 4 — Public idea form

> **File:** `src/app/(public)/ideas/[token]/page.tsx`

```typescript
interface PageProps {
  params: { token: string }
}

export default async function IdeaFormPage({ params }: PageProps) {
  const client = await getClientByToken(params.token)

  // Invalid token — show a clean error page
  if (!client) {
    return (
      <div style={{ /* centered error */ }}>
        <p>This link is invalid or has expired.</p>
      </div>
    )
  }

  return <IdeaFormClient
    token={params.token}
    clientName={client.clientName}
    agencyName={client.agencyName}
  />
}
```

The form is a client component (`'use client'`).

### Form state
```typescript
interface IdeaBrief {
  id:         string
  ideaText:   string
  extraNotes: string
  platform:   string
  targetDate: string
}

const [briefs, setBriefs]     = useState<IdeaBrief[]>([defaultBrief()])
const [submitting, setSubmitting] = useState(false)
const [submitted, setSubmitted]   = useState(false)
const [error, setError]           = useState<string | null>(null)

function defaultBrief(): IdeaBrief {
  return { id: crypto.randomUUID(), ideaText: '', extraNotes: '',
    platform: '', targetDate: '' }
}
```

### Form header (dark slate, matches existing design language)
```tsx
<div style={{ background: '#1A2630', padding: '22px 0 0' }}>
  <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 24px 20px' }}>
    <div style={{ fontSize: '10px', fontWeight: 500,
      color: 'rgba(236,232,225,0.45)', letterSpacing: '2px',
      textTransform: 'uppercase', marginBottom: '6px',
      display: 'flex', alignItems: 'center', gap: '7px' }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%',
        background: '#C07B55', display: 'inline-block' }}/>
      {agencyName}
    </div>
    <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
      fontSize: '22px', fontWeight: 400, color: '#ECE8E1', marginBottom: '5px' }}>
      Share a post idea, {clientName}
    </div>
    <div style={{ fontSize: '13px', color: 'rgba(236,232,225,0.55)',
      lineHeight: 1.55 }}>
      Tell us what you'd like to post and we'll take it from there.
      No login needed — just fill in the form below.
    </div>
  </div>
</div>
```

### Each brief card fields
1. **What's the post about?** — `<textarea>` required, placeholder "Describe the topic, angle, or message you have in mind..."
2. **Anything specific to include?** — `<textarea>` optional, placeholder "Specific products, phrases, things to avoid..."
3. **Platform** — optional pills: Instagram / Facebook / LinkedIn / X / TikTok
4. **Target date** — optional text input, placeholder "dd / mm / yyyy"

### Add / remove brief
```typescript
function addBrief()    { setBriefs(prev => [...prev, defaultBrief()]) }
function removeBrief(id: string) {
  setBriefs(prev => prev.filter(b => b.id !== id))
}
```

### Submit
```typescript
async function handleSubmit() {
  const valid = briefs.filter(b => b.ideaText.trim())
  if (valid.length === 0) {
    setError('Please describe at least one post idea')
    return
  }
  setSubmitting(true)
  setError(null)
  try {
    const res = await fetch('/api/ideas/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ideas: valid }),
    })
    if (!res.ok) throw new Error()
    setSubmitted(true)
  } catch {
    setError('Something went wrong. Please try again.')
  } finally {
    setSubmitting(false)
  }
}
```

### Success state
```tsx
{submitted && (
  <div style={{ /* centered, warm background */ }}>
    <div style={{ /* checkmark circle */ }}/>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}>
      Ideas sent!
    </div>
    <div>
      {agencyName} will review your ideas and get in touch.
    </div>
    <button onclick={() => { setSubmitted(false); setBriefs([defaultBrief()]) }}>
      Submit more ideas
    </button>
  </div>
)}
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Page loads with client name personalised in header
- [ ] Invalid token shows clean error, no crash
- [ ] "Add another idea" appends a new brief card
- [ ] "Remove" removes a card (min 0, all can be removed)
- [ ] Submit disabled when all idea_text fields empty
- [ ] Submit calls `/api/ideas/submit` and shows success state
- [ ] Native date input replaced with plain text input (no dark browser chrome)
- [ ] Platform pills work correctly

---

## Step 5 — Dashboard API route

> **File:** `src/app/api/ideas/route.ts`

```typescript
// GET — list ideas for workspace
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url      = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? undefined
  const status   = url.searchParams.get('status') as any ?? undefined

  const ideas = await getIdeasForWorkspace(session.workspaceId, { clientId, status })
  return NextResponse.json({ ideas })
}

// PATCH — update idea status
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ideaId, status, postId } = await req.json()
  await updateIdeaStatus(ideaId, session.workspaceId, status, postId)
  return NextResponse.json({ ok: true })
}
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `GET /api/ideas` returns ideas array for authenticated workspace
- [ ] `GET /api/ideas?clientId=X` filters correctly
- [ ] `PATCH` with `{ ideaId, status: 'dismissed' }` updates the row
- [ ] Returns 401 for unauthenticated requests

---

## Step 6 — Create `IdeaCard`

> **File:** `src/components/ideas/idea-card.tsx`

```typescript
interface IdeaCardProps {
  idea:       ClientIdea
  onGenerate: (idea: ClientIdea) => void
  onDismiss:  (id: string) => void
  clientDotColor: string   // per-client colour dot
}
```

```tsx
<div style={{
  background: '#fff',
  border: `0.5px solid rgba(44,62,80,0.12)`,
  borderRadius: '10px', overflow: 'hidden',
  transition: 'box-shadow 0.15s',
}}>
  {/* Header row */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px',
    padding: '11px 16px', borderBottom: '0.5px solid rgba(44,62,80,0.07)',
    flexWrap: 'wrap' }}>

    {/* New dot — only when status === 'new' AND readAt is null */}
    {!idea.readAt && (
      <div style={{ width: '7px', height: '7px', borderRadius: '50%',
        background: '#C07B55', flexShrink: 0 }}/>
    )}

    {/* Client name + colour dot */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
      fontSize: '12px', fontWeight: 500, color: '#1A2630' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%',
        background: clientDotColor, flexShrink: 0 }}/>
      {idea.clientName}
    </div>
    <span style={{ color: 'rgba(44,62,80,0.20)', fontSize: '11px' }}>·</span>
    <span style={{ fontSize: '11px', color: '#8A8070' }}>{idea.clientNiche}</span>

    {/* Platform pill */}
    {idea.platform && (
      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px',
        borderRadius: '4px', background: 'rgba(192,123,85,0.10)',
        color: '#C07B55' }}>
        {idea.platform}
      </span>
    )}

    {/* Target date */}
    {idea.targetDate && (
      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px',
        borderRadius: '4px', background: 'rgba(44,62,80,0.06)',
        color: '#8A8070' }}>
        Target: {idea.targetDate}
      </span>
    )}

    {/* Generated badge */}
    {idea.status === 'generated' && (
      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px',
        borderRadius: '4px', background: 'rgba(90,138,74,0.10)',
        color: '#5A8A4A', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        ✓ Generated
      </span>
    )}

    {/* Timestamp */}
    <span style={{ fontSize: '11px', color: 'rgba(138,128,112,0.7)',
      marginLeft: 'auto' }}>
      {timeAgo(idea.submittedAt)}
    </span>
  </div>

  {/* Idea text */}
  <div style={{ padding: '13px 16px', fontSize: '13px', color: '#1A2630',
    lineHeight: 1.68 }}>
    "{idea.ideaText}"
  </div>

  {/* Footer */}
  <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(44,62,80,0.07)',
    display: 'flex', alignItems: 'center', gap: '8px',
    background: '#FDFAF8' }}>

    {idea.status === 'generated' ? (
      <button onClick={() => {/* navigate to post */}} style={{
        padding: '7px 14px', background: 'none',
        border: '0.5px solid rgba(44,62,80,0.16)',
        borderRadius: '7px', fontSize: '11px', fontWeight: 500,
        color: '#8A8070', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        View generated post
      </button>
    ) : (
      <>
        <button onClick={() => onGenerate(idea)} style={{
          padding: '7px 16px', background: '#1A2630', color: '#ECE8E1',
          border: 'none', borderRadius: '7px', fontSize: '11px',
          fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.15s',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          {/* Lightning icon */}
          Generate from this idea
        </button>
        <button onClick={() => onDismiss(idea.id)} style={{
          fontSize: '11px', fontWeight: 500, color: 'rgba(138,128,112,0.7)',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Dismiss
        </button>
      </>
    )}
  </div>
</div>
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] New dot shown only when `readAt` is null
- [ ] Generated badge shown only when `status === 'generated'`
- [ ] "Generate from this idea" calls `onGenerate(idea)`
- [ ] "Dismiss" calls `onDismiss(idea.id)`
- [ ] Footer background `#FDFAF8` — matches existing card footer style

---

## Step 7 — Create `IdeaFilterBar`

> **File:** `src/components/ideas/idea-filter-bar.tsx`

```typescript
interface IdeaFilterBarProps {
  clients:        { id: string; name: string; newCount: number }[]
  activeClient:   string   // 'all' or client id
  activeStatus:   'new' | 'all' | 'used'
  totalCount:     number
  onClientChange: (id: string) => void
  onStatusChange: (s: 'new' | 'all' | 'used') => void
}
```

Layout: client pills → separator → status pills → count right-aligned.

Client pill style matches the platform pill pattern used in the generate wizard and throughout the app:
```
inactive: border 1px rgba(44,62,80,0.14), background #fff, color #8A8070
active:   border 1.5px #1A2630, background #1A2630, color #ECE8E1
```

Count badge on each client pill (new ideas only):
```typescript
// Only show badge when client has new unread ideas
{client.newCount > 0 && (
  <span style={{ fontSize: '10px', fontWeight: 600, padding: '0 4px',
    borderRadius: '6px',
    background: isActive ? 'rgba(236,232,225,0.18)' : 'rgba(192,123,85,0.18)',
    color: isActive ? 'rgba(236,232,225,0.8)' : '#C07B55',
    lineHeight: 1.4 }}>
    {client.newCount}
  </span>
)}
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] "All clients" pill shown first with total new count
- [ ] Per-client pills show new count badge when > 0
- [ ] Active pill: slate background
- [ ] Status pills: New / All / Used — only "New" shown by default as active
- [ ] Count label right-aligned updates when filters change

---

## Step 8 — Create Ideas page

> **File:** `src/app/(dashboard)/ideas/page.tsx`

```typescript
'use client'

const [ideas, setIdeas]           = useState<ClientIdea[]>([])
const [activeClient, setActiveClient] = useState<string>('all')
const [activeStatus, setActiveStatus] = useState<'new'|'all'|'used'>('new')
const [loading, setLoading]       = useState(true)
const router = useRouter()

// Fetch ideas
useEffect(() => {
  fetchIdeas()
}, [])

async function fetchIdeas() {
  setLoading(true)
  const res  = await fetch('/api/ideas')
  const data = await res.json()
  setIdeas(data.ideas)
  setLoading(false)

  // Mark unread as read
  const unreadIds = data.ideas
    .filter((i: ClientIdea) => !i.readAt)
    .map((i: ClientIdea) => i.id)
  if (unreadIds.length > 0) {
    await fetch('/api/ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', ids: unreadIds }),
    })
  }
}

// Derived: filtered ideas
const filteredIdeas = ideas.filter(i => {
  const matchClient = activeClient === 'all' || i.clientId === activeClient
  const matchStatus = activeStatus === 'all' ? true
    : activeStatus === 'new'  ? i.status === 'new'
    : /* used */ i.status === 'generated' || i.status === 'dismissed'
  return matchClient && matchStatus
})

// Per-client new counts (for filter bar badges)
const clientCounts = clients.map(c => ({
  ...c,
  newCount: ideas.filter(i => i.clientId === c.id && i.status === 'new').length
}))

// Generate from idea — navigate to wizard with ideaId param
function handleGenerate(idea: ClientIdea) {
  router.push(`/generate?ideaId=${idea.id}`)
}

// Dismiss
async function handleDismiss(ideaId: string) {
  setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, status: 'dismissed' } : i))
  await fetch('/api/ideas', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideaId, status: 'dismissed' }),
  })
}
```

### Page JSX
```tsx
<div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', background: '#F4EFE6' }}>

  {/* Topbar — existing shared topbar */}

  {/* Filter bar */}
  <IdeaFilterBar
    clients={clientCounts}
    activeClient={activeClient}
    activeStatus={activeStatus}
    totalCount={filteredIdeas.length}
    onClientChange={setActiveClient}
    onStatusChange={setActiveStatus}
  />

  {/* Sub-bar: count + sort */}
  <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(44,62,80,0.07)',
    padding: '8px 24px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', flexShrink: 0 }}>
    <span style={{ fontSize: '12px', color: '#8A8070' }}>
      <strong style={{ color: '#1A2630' }}>
        {filteredIdeas.length} {activeStatus === 'new' ? 'new ' : ''}
        idea{filteredIdeas.length !== 1 ? 's' : ''}
      </strong>
      {activeClient === 'all'
        ? ` · ${new Set(filteredIdeas.map(i => i.clientId)).size} clients`
        : ''}
    </span>
  </div>

  {/* Ideas list */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 32px',
    display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {filteredIdeas.length === 0 ? (
      <EmptyState status={activeStatus} clientName={...} />
    ) : (
      filteredIdeas.map(idea => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          clientDotColor={getClientColor(idea.clientId)}
          onGenerate={handleGenerate}
          onDismiss={handleDismiss}
        />
      ))
    )}
  </div>
</div>
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] Page loads with ideas from API
- [ ] Unread ideas marked as read when page opens
- [ ] Client filter narrows the list correctly
- [ ] Status filter New/All/Used works correctly
- [ ] Empty state shown when filter returns nothing
- [ ] "Generate from this idea" navigates to `/generate?ideaId=X`
- [ ] "Dismiss" optimistically removes the idea from the New list

---

## Step 9 — Client settings: Idea form tab

> **File:** `src/components/client-settings/idea-form-tab.tsx`

This is the "Idea form" tab inside the client's settings page.
It shows the unique link, copy/email actions, and a preview of recent ideas.

```typescript
interface IdeaFormTabProps {
  clientId:    string
  clientName:  string
  workspaceId: string
}
```

```typescript
// On mount: get or create the token
const [token, setToken]   = useState<string | null>(null)
const [ideas, setIdeas]   = useState<ClientIdea[]>([])

useEffect(() => {
  async function load() {
    // Server action or API call to getOrCreateToken
    const t = await getClientIdeaToken(clientId)
    setToken(t)
    const res = await fetch(`/api/ideas?clientId=${clientId}`)
    const data = await res.json()
    setIdeas(data.ideas)
  }
  load()
}, [clientId])

const formUrl = token ? `${window.location.origin}/ideas/${token}` : ''
```

```tsx
{/* Link card */}
<SectionCard title="Client idea form"
  subtitle={`Send this link to ${clientName} so they can submit post ideas directly. No login required.`}
  headerAction={
    ideas.filter(i => i.status === 'new').length > 0 && (
      <span style={{ /* green badge: N ideas submitted */ }}>
        {ideas.filter(i => i.status === 'new').length} new ideas
      </span>
    )
  }>
  <div style={{ padding: '16px 20px' }}>
    {/* URL row */}
    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
      <div style={{ /* url display box */ }}>{formUrl}</div>
      <button onClick={() => navigator.clipboard.writeText(formUrl)}>
        Copy link
      </button>
      <button onClick={handleSendEmail}>Send by email</button>
    </div>
    {/* Meta row: last submitted, link age, visits */}
    <MetaRow ideas={ideas} token={token} />
  </div>
</SectionCard>

{/* Recent ideas preview */}
{ideas.length > 0 && (
  <>
    <div style={{ /* section header */ }}>
      <span>Submitted ideas</span>
      <button onClick={() => router.push('/ideas')}>View all →</button>
    </div>
    {ideas.slice(0, 3).map(idea => (
      <IdeaCard key={idea.id} idea={idea}
        onGenerate={i => router.push(`/generate?ideaId=${i.id}`)}
        onDismiss={handleDismiss} />
    ))}
  </>
)}
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Token generated on first visit, same token returned on subsequent visits
- [ ] Form URL displays correctly
- [ ] Copy link button copies to clipboard
- [ ] New ideas count badge shown in card header
- [ ] "View all →" navigates to `/ideas?clientId=X`

---

## Step 10 — Generate wizard: accept `ideaId`

> **File:** `src/app/(generate)/generate/page.tsx` (existing)
> **File:** `src/components/generate/wizard-topbar.tsx` (existing)

### In `generate/page.tsx`
```typescript
// Read ideaId from URL search params
const searchParams = useSearchParams()
const ideaId       = searchParams.get('ideaId')

// Fetch the idea on mount if ideaId present
const [sourceIdea, setSourceIdea] = useState<ClientIdea | null>(null)

useEffect(() => {
  if (!ideaId) return
  fetch(`/api/ideas?ideaId=${ideaId}`)
    .then(r => r.json())
    .then(data => {
      const idea = data.idea
      setSourceIdea(idea)
      // Pre-fill step 1 values from the idea
      setSelectedClientId(idea.clientId)
      setSelectedPlatform(idea.platform ?? 'Instagram')
      // Pre-fill step 2 brief with the idea text
      setBriefs([{
        id:         crypto.randomUUID(),
        title:      '',
        brief:      idea.ideaText,
        platform:   idea.platform ?? 'Instagram',
        targetDate: idea.targetDate ?? '',
      }])
      // Jump to step 3 — skip 1 and 2
      setCurrentStep(3)
    })
}, [ideaId])
```

### `WizardTopbar` — context banner
Add a context banner below the topbar when `sourceIdea` is present.
The banner is NOT part of the step strip — it sits between topbar and content.

```tsx
{sourceIdea && currentStep < 5 && (
  <div style={{
    background: '#fff',
    borderBottom: '0.5px solid rgba(44,62,80,0.10)',
    padding: '10px 28px',
    display: 'flex', alignItems: 'center', gap: '12px',
    flexShrink: 0,
  }}>
    <span style={{ fontSize: '10px', fontWeight: 500, color: '#8A8070',
      letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0 }}>
      From idea
    </span>

    {/* Client pill */}
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px',
      borderRadius: '5px', background: 'rgba(44,62,80,0.07)', color: '#1A2630',
      display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      {sourceIdea.clientName}
    </span>

    {/* Platform pill */}
    {sourceIdea.platform && (
      <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px',
        borderRadius: '5px', background: 'rgba(192,123,85,0.12)', color: '#C07B55' }}>
        {sourceIdea.platform}
      </span>
    )}

    {/* Idea quote pill — truncated */}
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px',
      borderRadius: '5px', background: 'rgba(44,94,138,0.08)', color: '#2C5F8A',
      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      maxWidth: '400px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      {/* Speech bubble icon */}
      "{sourceIdea.ideaText.slice(0, 80)}{sourceIdea.ideaText.length > 80 ? '…' : ''}"
    </span>

    {/* Edit button — goes back to step 1 */}
    <button onClick={() => setCurrentStep(1)} style={{
      marginLeft: 'auto', fontSize: '11px', fontWeight: 500, color: '#8A8070',
      background: 'none', border: '0.5px solid rgba(44,62,80,0.14)',
      borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
      fontFamily: 'inherit', flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: '5px',
    }}>
      Edit
    </button>
  </div>
)}
```

### Loading stage 2 label change
When `sourceIdea` is present, stage 2 label changes:
```typescript
const stage2Label = sourceIdea
  ? 'Applying client idea as brief'
  : 'Selecting relevant source articles'
```

### Mark idea as generating → generated
```typescript
// When generate starts:
if (ideaId) {
  await fetch('/api/ideas', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideaId, status: 'generating' }),
  })
}

// When generation completes:
if (ideaId && generatedPostId) {
  await fetch('/api/ideas', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideaId, status: 'generated', postId: generatedPostId }),
  })
}
```

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `/generate?ideaId=X` opens wizard directly at step 3
- [ ] Steps 1 and 2 show ✓ in the topbar
- [ ] Context banner visible below topbar with client, platform, idea quote
- [ ] "Edit" in context banner goes back to step 1
- [ ] Stage 2 label: "Applying client idea as brief"
- [ ] On generation complete: idea status updated to 'generated' in DB
- [ ] Without `ideaId`: wizard behaves exactly as before — no regression

---

## Step 11 — Dashboard sidebar nav item

> **File:** wherever the sidebar navigation items are defined

```typescript
// Add between Calendar and Analytics:
{
  href:  '/ideas',
  label: 'Client ideas',
  icon:  <ChatBubbleIcon />,
  badge: newIdeasCount,   // from a lightweight poll or server prop
}
```

The badge count should reflect unread (new) ideas across all clients.
Load this from the existing notification store or a separate lightweight fetch.

```bash
grep -rn "Calendar\|Analytics\|Review queue" src/components/layout/ | head -10
# Find the nav items array and add Client ideas in the right position
```

### ✓ Step 11 Verification
- [ ] "Client ideas" nav item visible in sidebar
- [ ] Badge shows count of unread ideas
- [ ] Badge disappears when all ideas are read (page opens and marks them read)
- [ ] Active state highlights correctly when on `/ideas`

---

## Step 12 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Flow test: client submits ideas
1. Open client settings → Idea form tab
2. Copy the form link
3. Open link in incognito (no login)
4. Fill in 2 ideas and submit
5. Check: ideas appear in `/ideas` with "New" status
6. Check: sidebar badge increments
7. Click "Generate from this idea" on idea 1
8. Check: wizard opens at step 3 with context banner
9. Check: steps 1 + 2 show ✓ already
10. Select Carousel, click Generate
11. Check: results appear, idea status → "Generated"
12. Check: idea card in `/ideas` shows "Generated" badge

### Visual checks
- [ ] Public form: personalised header with client name
- [ ] Public form: no dashboard chrome, no login
- [ ] Public form success: clear confirmation message
- [ ] Ideas page filter: client pills with counts
- [ ] Ideas page filter: New/All/Used toggle
- [ ] Idea card: new dot on unread items
- [ ] Idea card: "Generated" badge with muted styling
- [ ] Wizard context banner: visible on steps 3–4
- [ ] Wizard context banner: hidden on step 5 (results)

---

## What is NOT changed

| Item | Why |
|---|---|
| Generate pipeline / AI calls | Not in scope — ideaId is only a pre-fill |
| Existing wizard steps 1–4 (without ideaId) | Not touched — full regression safety |
| Review queue | Not in scope |
| Analytics | Not in scope |
| Client profile / pillar / source settings | Not in scope |

---

## Implementation order

```
Step 1  → lib/ideas.ts                       — DB helpers (verify schema first)
Step 2  → api/ideas/submit/route.ts          — public POST endpoint
Step 3  → (public)/layout.tsx                — bare public layout
Step 4  → (public)/ideas/[token]/page.tsx    — client form
Step 5  → api/ideas/route.ts                 — dashboard GET + PATCH
Step 6  → components/ideas/idea-card.tsx     — single idea card
Step 7  → components/ideas/idea-filter-bar.tsx
Step 8  → (dashboard)/ideas/page.tsx         — ideas inbox (uses 6+7)
Step 9  → client-settings/idea-form-tab.tsx  — link + preview in settings
Step 10 → (generate)/generate/page.tsx       — ideaId pre-fill + context banner
Step 11 → sidebar nav item                   — add Client ideas with badge
Step 12 → end-to-end verification
```

---

*Kontuur — Client Ideas Feature Plan*
*Public form (no auth) → Dashboard inbox with filtering → Generate wizard pre-fill.*
*Wizard skips to Step 3 when launched from an idea. Context banner shows what's pre-filled.*
*Existing generate pipeline unchanged.*