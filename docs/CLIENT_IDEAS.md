# Client Idea Submission — Feature Plan

## What This Builds

Agency generates a unique link per client. Sends it via email or WhatsApp. Client opens the link, fills in post ideas for the upcoming week, submits. Ideas land in the agency dashboard. Agency selects which ideas to include in the next generation run — they feed directly into the existing `priorityPosts` pipeline.

No login required for the client. The token is the auth.

---

## User Flow

```
Agency dashboard
  → "Request ideas from client" button on client page
  → Generates unique link, copies to clipboard or opens email/WhatsApp compose
  → Sends link to client

Client receives link → opens /submit/[token]
  → Sees simple branded form: "What would you like to post about this week?"
  → Fills in 1–5 ideas (title + optional notes + optional target date)
  → Submits → sees confirmation screen

Agency dashboard
  → Notification that [Client] submitted ideas
  → Sees submitted ideas in client page under "Client ideas"
  → Checkbox to include each idea in next generation run
  → Selected ideas become priorityPosts in GeneratePostsContext
```

---

## Database Schema

Two new tables in Supabase.

### `client_submission_tokens`

```sql
create table client_submission_tokens (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  created_by  uuid not null references auth.users(id),
  token       uuid not null unique default gen_random_uuid(),
  expires_at  timestamptz not null,
  -- null = still valid, set when client submits (or allow reuse until expiry)
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Agency queries by client_id to list recent tokens
create index on client_submission_tokens(client_id);

-- Public form validates by token value
create index on client_submission_tokens(token);
```

### `client_post_ideas`

```sql
create table client_post_ideas (
  id           uuid primary key default gen_random_uuid(),
  token_id     uuid not null references client_submission_tokens(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  title        text not null,
  description  text,                        -- optional client notes
  target_date  date,                        -- optional "I want this live by..."
  priority     int not null default 5,      -- 1–10, client can rank if multiple
  -- Agency workflow
  included_in_run  boolean not null default false,   -- agency selected this idea
  used_at          timestamptz,                       -- idea was used in a generation run
  created_at       timestamptz not null default now()
);

create index on client_post_ideas(client_id);
create index on client_post_ideas(token_id);
create index on client_post_ideas(included_in_run) where included_in_run = true;
```

### RLS policies

```sql
-- Tokens: agency can read/write their own clients' tokens
alter table client_submission_tokens enable row level security;

create policy "agency_manage_tokens" on client_submission_tokens
  for all using (
    created_by = auth.uid()
  );

-- Ideas: agency can read ideas for their clients
alter table client_post_ideas enable row level security;

create policy "agency_read_ideas" on client_post_ideas
  for select using (
    exists (
      select 1 from clients
      where clients.id = client_post_ideas.client_id
        and clients.user_id = auth.uid()
    )
  );

create policy "agency_update_ideas" on client_post_ideas
  for update using (
    exists (
      select 1 from clients
      where clients.id = client_post_ideas.client_id
        and clients.user_id = auth.uid()
    )
  );

-- Public submission: no auth, token validates access
-- Handled by a service-role API route — not direct client access
```

---

## File Structure

```
app/
├── submit/
│   └── [token]/
│       ├── page.tsx              # Public form page — no auth
│       └── success/
│           └── page.tsx          # Confirmation screen

app/api/
├── client-ideas/
│   ├── [token]/
│   │   └── route.ts             # GET — validate token + fetch client name
│   │                            # POST — submit ideas (public, service role)
│   └── route.ts                 # GET — list ideas for agency (authenticated)
│                                # PATCH — mark idea included_in_run / used
│
└── submission-tokens/
    └── route.ts                 # POST — generate token (authenticated agency)

features/
└── client-ideas/
    ├── types.ts                 # ClientPostIdea, SubmissionToken, IdeaFormValues
    ├── use-client-ideas.ts      # Hook for agency dashboard
    └── idea-submission-form.tsx # The public-facing form component
```

---

## Build Order

```
Step 1  → Database migration (tables + indexes + RLS)
Step 2  → Add types to types/api.ts or features/client-ideas/types.ts
Step 3  → POST /api/submission-tokens — generate token (agency)
Step 4  → GET /api/client-ideas/[token] — validate token, return client name
Step 5  → Public form page app/submit/[token]/page.tsx
Step 6  → POST /api/client-ideas/[token] — submit ideas (public)
Step 7  → Success page app/submit/[token]/success/page.tsx
Step 8  → GET /api/client-ideas — list submitted ideas (agency)
Step 9  → PATCH /api/client-ideas — toggle included_in_run (agency)
Step 10 → Agency dashboard UI — "Request ideas" button + ideas list
Step 11 → Wire submitted ideas into generation run as priorityPosts
Step 12 → Verification
```

---

## Step 1 — Database Migration

Create the two tables above. Run in Supabase SQL editor.

After running:
- [ ] Both tables visible in Supabase table editor
- [ ] RLS enabled on both
- [ ] `gen_random_uuid()` works (requires pgcrypto — already enabled in Supabase)

---

## Step 2 — Types

> **File:** `features/client-ideas/types.ts`

```typescript
export interface SubmissionToken {
  id: string
  client_id: string
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export interface ClientPostIdea {
  id: string
  token_id: string
  client_id: string
  title: string
  description: string | null
  target_date: string | null    // ISO date string YYYY-MM-DD
  priority: number
  included_in_run: boolean
  used_at: string | null
  created_at: string
}

// What the form collects per idea
export interface IdeaFormEntry {
  title: string
  description?: string
  target_date?: string
}

// What the public form page needs from the token validation endpoint
export interface TokenValidationResult {
  valid: boolean
  client_name: string | null
  expired: boolean
}
```

---

## Step 3 — POST /api/submission-tokens

> **File:** `app/api/submission-tokens/route.ts`
> Authenticated — agency only.

```typescript
// POST body:
{ client_id: string }

// What it does:
// 1. Verify auth + client ownership
// 2. Insert into client_submission_tokens
// 3. Return the full URL: process.env.NEXT_PUBLIC_APP_URL + '/submit/' + token

// Token expiry: reuse APPROVAL_TOKEN_EXPIRY_HOURS from constants
// expires_at = now() + APPROVAL_TOKEN_EXPIRY_HOURS hours

// Response:
{
  token: string,
  url: string,           // full URL to send to client
  expires_at: string
}
```

---

## Step 4 — GET /api/client-ideas/[token]

> **File:** `app/api/client-ideas/[token]/route.ts`
> Public — no auth. Token validates access.

```typescript
// GET /api/client-ideas/[token]
// Returns: TokenValidationResult

// Logic:
// 1. Look up token in client_submission_tokens
// 2. If not found: { valid: false, expired: false, client_name: null }
// 3. If expires_at < now(): { valid: false, expired: true, client_name: null }
// 4. If valid: fetch client name from clients table
//    Return: { valid: true, expired: false, client_name: 'Физиомед' }

// Note: use supabase service role client here — this is a public route
// with no auth.uid(), but we still need to read the database.
```

---

## Step 5 — Public Form Page

> **File:** `app/submit/[token]/page.tsx`

Server component that validates the token on load, passes client name to the form.

```typescript
// On load:
// 1. Call GET /api/client-ideas/[token] (or call Supabase directly from server)
// 2. If invalid/expired: render "This link is no longer valid" message
// 3. If valid: render <IdeaSubmissionForm clientName={...} token={...} />
```

**Form design** (`features/client-ideas/idea-submission-form.tsx`):

```
"What would you like to post about this week?"
Subheading: "Share 1–5 ideas. Your agency will take it from here."

[+ Add idea] button — starts with 1 empty idea row

Per idea:
  Topic *                [text input, required]
  Notes                  [textarea, optional — "anything useful for the writer"]
  Target date            [date picker, optional — "I'd like this posted by..."]

[Submit ideas]
```

The form should be clean and minimal — the client should not feel like they are filling in a work form. No PostFlow branding beyond the client name in the header. White page, large text, one action per line.

### ✓ Step 5 Verification
- [ ] `/submit/[valid-token]` renders the form
- [ ] `/submit/[expired-token]` renders the expired message
- [ ] `/submit/[invalid-token]` renders the invalid message
- [ ] Form has at least one idea input on load
- [ ] Can add up to 5 idea rows
- [ ] All fields render correctly on mobile

---

## Step 6 — POST /api/client-ideas/[token]

> **File:** `app/api/client-ideas/[token]/route.ts`
> Public — no auth. Token validates access.

```typescript
// POST body:
{
  ideas: IdeaFormEntry[]    // 1–5 entries
}

// Logic:
// 1. Validate token (same as GET — check exists + not expired)
// 2. Validate body: 1–5 ideas, each with non-empty title
// 3. Begin transaction:
//    a. Insert all ideas into client_post_ideas
//    b. Update token used_at = now() (marks token as submitted)
//       Note: used_at does NOT invalidate the token for resubmission —
//       decide here whether one submission per token or allow updates until expiry.
//       Recommendation: allow resubmission until expiry (client may want to change ideas)
//       If resubmitting: delete previous ideas for this token_id, insert new ones.
// 4. Return { success: true }

// Rate limit: max 3 submissions per token per hour
// (prevents accidental spam — client should only submit once or twice)
```

---

## Step 7 — Success Page

> **File:** `app/submit/[token]/success/page.tsx`

Simple static page. After form submission, redirect here.

```
✓ Ideas submitted

[Client name] will receive your ideas shortly.
You can update your ideas by going back and resubmitting before [expires_at date].
```

---

## Step 8 — GET /api/client-ideas

> **File:** `app/api/client-ideas/route.ts`
> Authenticated — agency only.

```typescript
// GET /api/client-ideas?client_id=xxx
// Returns ideas for a client, ordered by created_at desc
// Joins with client_submission_tokens to show submission date

// Response:
{
  ideas: ClientPostIdea[],
  submitted_at: string | null    // most recent token used_at for this client
}
```

---

## Step 9 — PATCH /api/client-ideas

> **File:** `app/api/client-ideas/route.ts`
> Authenticated — agency only.

```typescript
// PATCH /api/client-ideas
// Body: { idea_id: string, included_in_run: boolean }
// Toggles whether an idea is included in the next generation run

// Also needs:
// PATCH to mark ideas as used_at when a generation run includes them
// This can be done inside generate-posts.ts after processing priority posts
```

---

## Step 10 — Agency Dashboard UI

### "Request ideas" button on client page

Place on the client detail page, near the generation controls.

```
[📋 Request client ideas]
```

On click:
1. Call `POST /api/submission-tokens` with `client_id`
2. Copy URL to clipboard
3. Show toast: "Link copied — send it to [client name]"
4. Optionally show a modal with the link + "Open in WhatsApp" / "Open in email" shortcuts

```typescript
// WhatsApp deep link:
`https://wa.me/?text=${encodeURIComponent('Here is your idea submission link: ' + url)}`

// Email compose:
`mailto:?subject=Post ideas for this week&body=${encodeURIComponent(url)}`
```

### Client ideas section on client page

Below the existing content, add an "Ideas from client" section that appears when there are pending ideas.

```
Ideas from client (3)     [submitted 2 days ago]

☑ Idea 1 title            "notes if any"    [target: Mon 14 Apr]
☐ Idea 2 title            "notes if any"
☐ Idea 3 title

[Include selected in next run]
```

Checkbox state is optimistically updated via `PATCH /api/client-ideas`.

### Hook

> **File:** `features/client-ideas/use-client-ideas.ts`

```typescript
export function useClientIdeas(clientId: string) {
  // SWR or React Query for fetching ideas
  // Returns: ideas, submittedAt, toggleIdea(id, included), isLoading
}
```

---

## Step 11 — Wire into Generation Run

> **File:** `features/ai/generation/generate-posts.ts`

The existing `GeneratePostsContext` already has a `priorityPosts: PriorityPost[]` field. Client ideas map directly to this type.

**In the route handler `app/api/ai/generate/route.ts`:**

```typescript
// Fetch included client ideas for this client
const { data: clientIdeas } = await supabase
  .from('client_post_ideas')
  .select('*')
  .eq('client_id', body.client_id)
  .eq('included_in_run', true)
  .is('used_at', null)    // only unprocessed ideas

// Map to PriorityPost shape
const ideaPriorityPosts: PriorityPost[] = clientIdeas.map(idea => ({
  title: idea.title,
  brief: idea.description ?? undefined,
  targetDate: idea.target_date ?? undefined,
}))

// Merge with any manually added priority posts from the request body
const allPriorityPosts = [...ideaPriorityPosts, ...(body.priorityPosts ?? [])]

// Pass to generatePosts
const result = await generatePosts({
  ...ctx,
  priorityPosts: allPriorityPosts,
})
```

**After the generation run completes**, mark the used ideas:

```typescript
if (clientIdeas.length > 0) {
  void supabase
    .from('client_post_ideas')
    .update({ used_at: new Date().toISOString() })
    .in('id', clientIdeas.map(i => i.id))
}
```

---

## Step 12 — Verification

### API verification
```bash
# Generate a token (replace with real client_id and auth cookie)
curl -X POST /api/submission-tokens \
  -H "Content-Type: application/json" \
  -d '{"client_id": "..."}'

# Validate token
curl /api/client-ideas/[token]
# Expected: { valid: true, expired: false, client_name: "Физиомед" }

# Submit ideas (no auth)
curl -X POST /api/client-ideas/[token] \
  -H "Content-Type: application/json" \
  -d '{"ideas": [{"title": "Test idea", "description": "Some notes"}]}'
# Expected: { success: true }

# Fetch ideas (authenticated)
curl /api/client-ideas?client_id=[id]
# Expected: ideas array with the submitted idea
```

### UI verification
- [ ] "Request ideas" button generates a link and copies to clipboard
- [ ] Public form renders at `/submit/[token]` on mobile
- [ ] Form submits and redirects to success page
- [ ] Resubmission replaces previous ideas, does not duplicate
- [ ] Expired token shows correct message
- [ ] Agency sees submitted ideas in client page
- [ ] Toggling "included in run" persists after page refresh
- [ ] Included ideas appear in generation run as priority posts
- [ ] After generation, included ideas are marked `used_at`

### Edge cases
- [ ] Empty title — form validates, submission rejected with 400
- [ ] More than 5 ideas — 6th row cannot be added
- [ ] Token used after expiry — returns 410 Gone
- [ ] Client submits twice — second submission replaces the first
- [ ] Agency generates two tokens for same client — both valid, ideas from both visible

---

## Security Notes

**The token IS the auth for the public form.** No additional protection needed — a UUID v4 token has 122 bits of entropy and is unguessable by brute force.

**Do not expose client data on the public form beyond the client name.** The form should not show previous posts, generation history, or anything else from the client's account.

**Service role usage on public routes:** Steps 4 and 6 use the Supabase service role client because they have no `auth.uid()`. Keep these routes narrow — they should only read/write `client_submission_tokens` and `client_post_ideas`, nothing else.

**Rate limiting:** Apply the existing `rate-limit.ts` to the public submission route. 3 submissions per token per hour is sufficient.

---

## What This Does Not Cover (Deliberate Scope Limit)

- Email delivery (sending the link by email from PostFlow) — just copy-to-clipboard for now, add SendGrid/Resend later
- Client notifications when ideas are used — add later
- Client seeing their own past submissions — not needed, agency manages this
- Multi-language form — the form text is currently in English; add language detection based on client profile language later

---

*PostFlow — Client Idea Submission Feature*
*Build in step order. Verify each step before proceeding.*