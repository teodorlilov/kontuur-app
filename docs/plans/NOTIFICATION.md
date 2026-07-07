# Client Response Notification System — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify existing client review page actions.
> This plan adds a new notification layer on top of existing infrastructure.

---

## Context

When a client approves posts or requests changes via the public review link,
the social media manager currently has no way of knowing without refreshing.

**Posts are sent for client review from the Calendar only.**
The review queue is the agency's internal tool — it is not involved in the
client notification flow. Do not add any indicators to the review queue.

This plan adds three surfaces:

1. **Notification bell** — topbar badge with dropdown panel showing all responses
2. **Toast notifications** — bottom-right pop-ups when a client responds in real time
3. **Client response card** — shown on the calendar post detail when client has responded
4. **Polling** — checks for new responses every 30 seconds (no WebSocket needed for v1)

---

## Data Model

### Notification types
```typescript
type NotificationType =
  | 'client_approved_all'   // client approved every post in the batch
  | 'client_approved_one'   // client approved a single post
  | 'client_feedback'       // client requested changes with a message
  | 'client_partial'        // client reviewed some but not all posts

interface Notification {
  id:            string
  type:          NotificationType
  clientName:    string
  clientId:      string
  postId?:       string       // null for batch notifications
  postNumber?:   number
  feedbackText?: string       // only for client_feedback
  approvedCount?: number
  pendingCount?:  number
  feedbackCount?: number
  createdAt:     Date
  readAt:        Date | null  // null = unread
  reviewToken:   string
}
```

### Post — new fields needed
```typescript
// Add to existing Post model — calendar post detail reads these:
clientRespondedAt?:  Date
clientResponseType?: 'approved' | 'changes_requested'
clientFeedbackText?: string
```

No `isNew` flag needed — the notification panel and toast handle the
"seen/unseen" state. The post detail just shows the response if it exists.

### Database changes
```sql
-- New table
CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  type           TEXT NOT NULL,
  client_id      UUID REFERENCES clients(id),
  post_id        UUID REFERENCES posts(id),
  feedback_text  TEXT,
  approved_count INT,
  pending_count  INT,
  feedback_count INT,
  review_token   TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  read_at        TIMESTAMPTZ
);

-- Add to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS client_responded_at   TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS client_response_type  TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS client_feedback_text  TEXT;
```

> **Check actual schema first:**
> ```bash
> find src -name "*.ts" | xargs grep -l "supabase\|prisma\|drizzle" | head -5
> ```
> Map the above to your actual column naming convention before writing migrations.

---

## Architecture

```
Client submits review (approve / feedback)
         ↓
Existing server action  ← unchanged core logic
         ↓  [ADD] write to notifications table
         ↓  [ADD] update post.client_response_* fields
         ↓
Agency dashboard polls /api/notifications every 30s
         ↓
NotificationStore (Zustand) updates
         ↓
  ┌─────────────────────┬──────────────────────────┐
  │  Bell + panel       │  Toast (bottom-right)     │
  └─────────────────────┴──────────────────────────┘
         ↓
  Calendar post detail shows ClientResponseCard
  when post.clientResponseType is set
```

---

## File Structure

| File | Change |
|---|---|
| `src/lib/notifications.ts` | CREATE — DB helpers |
| `src/stores/notification-store.ts` | CREATE — Zustand store |
| `src/hooks/use-notifications.ts` | CREATE — polling hook |
| `src/app/api/notifications/route.ts` | CREATE — GET + POST endpoint |
| `src/components/layout/notification-bell.tsx` | CREATE — bell + panel |
| `src/components/layout/notification-item.tsx` | CREATE — single notification row |
| `src/components/notifications/toast-container.tsx` | CREATE — toast host |
| `src/components/notifications/toast-item.tsx` | CREATE — single toast |
| `src/components/calendar/client-response-card.tsx` | CREATE — response card in calendar post detail |
| `src/app/(dashboard)/layout.tsx` | UPDATE — mount bell + toast container |
| Server action: client approval | UPDATE — add notification creation |
| Server action: client feedback | UPDATE — add notification creation |

**NOT modified:** Review queue components, review queue list items, review queue page.

---

## Design Tokens

```
Bell badge — approvals only:  background #C07B55
Bell badge — any feedback:    background #B43232, animation: notif-pulse 2s infinite
Bell badge pulse keyframes:   0%,100% { box-shadow: 0 0 0 0 rgba(180,50,50,0.4) }
                               50%    { box-shadow: 0 0 0 4px rgba(180,50,50,0) }

Notification panel:    width 360px, border-radius 14px
                       box-shadow: 0 8px 32px rgba(44,62,80,0.14)
Unread row:            background #FDFAF8, left bar 2px solid #C07B55
Read row:              transparent

Notification icons:
  approved:  rgba(90,138,74,0.12)  / #5A8A4A
  feedback:  rgba(44,94,138,0.10)  / #2C5F8A
  partial:   rgba(192,123,85,0.10) / #C07B55

Toast:  max-width 380px, border-radius 12px
        position fixed, bottom 20px, right 20px
        box-shadow: 0 4px 16px rgba(44,62,80,0.12)
        auto-dismiss: 6 seconds
Toast left indicator: 3px wide
  approved: #5A8A4A
  feedback: #2C5F8A

Client response card — feedback: border rgba(44,94,138,0.20), header rgba(44,94,138,0.04)
Client response card — approved: border rgba(90,138,74,0.25), header rgba(90,138,74,0.04)
```

---

## Step 1 — Create notification DB helpers

> **File:** `src/lib/notifications.ts`

```typescript
import { createServerSupabaseClient } from './supabase'   // adjust path

export async function createNotification(
  workspaceId: string,
  data: Omit<Notification, 'id' | 'createdAt' | 'readAt'>
): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.from('notifications').insert({
    workspace_id:   workspaceId,
    type:           data.type,
    client_id:      data.clientId,
    post_id:        data.postId ?? null,
    feedback_text:  data.feedbackText ?? null,
    approved_count: data.approvedCount ?? null,
    pending_count:  data.pendingCount ?? null,
    feedback_count: data.feedbackCount ?? null,
    review_token:   data.reviewToken,
  })
}

export async function getRecentNotifications(
  workspaceId: string,
  limit = 30
): Promise<Notification[]> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('notifications')
    .select('*, clients(name)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(mapNotification)
}

export async function markAllNotificationsRead(
  workspaceId: string
): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .is('read_at', null)
}

function mapNotification(row: any): Notification {
  return {
    id:            row.id,
    type:          row.type,
    clientName:    row.clients?.name ?? 'Client',
    clientId:      row.client_id,
    postId:        row.post_id,
    feedbackText:  row.feedback_text,
    approvedCount: row.approved_count,
    pendingCount:  row.pending_count,
    feedbackCount: row.feedback_count,
    reviewToken:   row.review_token,
    createdAt:     new Date(row.created_at),
    readAt:        row.read_at ? new Date(row.read_at) : null,
  }
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `getRecentNotifications` returns newest first
- [ ] `markAllNotificationsRead` only touches unread rows for the workspace
- [ ] `createNotification` inserts correctly — verify with a manual Supabase query

---

## Step 2 — Create `/api/notifications` route

> **File:** `src/app/api/notifications/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getRecentNotifications, markAllNotificationsRead } from '@/lib/notifications'
import { getSession } from '@/lib/auth'   // adjust to your auth helper

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notifications = await getRecentNotifications(session.workspaceId)
  const unreadCount   = notifications.filter(n => !n.readAt).length

  return NextResponse.json({ notifications, unreadCount })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json()

  if (action === 'mark_all_read') {
    await markAllNotificationsRead(session.workspaceId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `GET /api/notifications` returns `{ notifications: [], unreadCount: 0 }` shape
- [ ] Returns 401 for unauthenticated requests
- [ ] `POST { action: 'mark_all_read' }` calls `markAllNotificationsRead`

---

## Step 3 — Create Zustand notification store

> **File:** `src/stores/notification-store.ts`

```typescript
import { create } from 'zustand'

interface Toast {
  id:          string
  type:        'approved' | 'feedback' | 'partial'
  clientName:  string
  message:     string
  postId?:     string
  postNumber?: number
}

interface NotificationState {
  notifications: Notification[]
  unreadCount:   number
  toasts:        Toast[]
  isOpen:        boolean
  setNotifications: (n: Notification[], count: number) => void
  addToast:         (t: Omit<Toast, 'id'>) => void
  dismissToast:     (id: string) => void
  setOpen:          (open: boolean) => void
  markAllRead:      () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount:   0,
  toasts:        [],
  isOpen:        false,

  setNotifications: (notifications, unreadCount) =>
    set({ notifications, unreadCount }),

  addToast: (toast) =>
    set(state => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }]
    })),

  dismissToast: (id) =>
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  setOpen: (open) => set({ isOpen: open }),

  markAllRead: () =>
    set(state => ({
      unreadCount: 0,
      notifications: state.notifications.map(n => ({
        ...n, readAt: n.readAt ?? new Date()
      }))
    })),
}))
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `addToast` appends with a unique id
- [ ] `dismissToast` removes by id only
- [ ] `markAllRead` is optimistic — caller handles the API call

---

## Step 4 — Create polling hook

> **File:** `src/hooks/use-notifications.ts`

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/stores/notification-store'

const POLL_INTERVAL = 30_000   // 30 seconds

export function useNotifications() {
  const { setNotifications, addToast } = useNotificationStore()
  const prevUnreadIds = useRef<Set<string>>(new Set())
  const isFirstPoll   = useRef(true)

  async function poll() {
    try {
      const res  = await fetch('/api/notifications', { credentials: 'include' })
      if (!res.ok) return
      const data: { notifications: Notification[]; unreadCount: number } =
        await res.json()

      setNotifications(data.notifications, data.unreadCount)

      // Show toasts only for notifications that appeared since last poll
      if (!isFirstPoll.current) {
        data.notifications
          .filter(n => !n.readAt && !prevUnreadIds.current.has(n.id))
          .forEach(n => addToast(buildToast(n)))
      }

      prevUnreadIds.current = new Set(
        data.notifications.filter(n => !n.readAt).map(n => n.id)
      )
      isFirstPoll.current = false

    } catch {
      // Polling must never crash the UI — silently ignore network errors
    }
  }

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])
}

function buildToast(n: Notification): Omit<Toast, 'id'> {
  return {
    type:       n.type === 'client_approved_all' || n.type === 'client_approved_one'
                  ? 'approved'
                  : n.type === 'client_partial' ? 'partial' : 'feedback',
    clientName: n.clientName,
    message:    buildMessage(n),
    postId:     n.postId,
    postNumber: n.postNumber,
  }
}

function buildMessage(n: Notification): string {
  switch (n.type) {
    case 'client_approved_all':
      return `${n.approvedCount} post${n.approvedCount !== 1 ? 's' : ''} approved — ready to schedule`
    case 'client_approved_one':
      return `Post #${n.postNumber} approved`
    case 'client_feedback':
      const text = n.feedbackText ?? 'Changes requested'
      return text.length > 100 ? text.slice(0, 100) + '…' : text
    case 'client_partial':
      return `${n.approvedCount} approved · ${n.feedbackCount} feedback · ${n.pendingCount} pending`
    default:
      return 'New client response'
  }
}
```

**Critical:** `isFirstPoll.current` prevents toasts firing on page load for
already-existing notifications. Do not remove this guard.

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] First poll: populates store, zero toasts fired
- [ ] Second poll with new notification: toast fired for new id only
- [ ] `clearInterval` on unmount — no memory leak
- [ ] Network error: store unchanged, no crash

---

## Step 5 — Create `NotificationItem`

> **File:** `src/components/layout/notification-item.tsx`

```typescript
interface NotificationItemProps {
  notification: Notification
  onNavigate?:  () => void
}
```

Key rules for this component:
- Unread: `#FDFAF8` background + terracotta 2px left bar
- Feedback text: quoted in a blue-tinted block, truncated at 120 chars
- Action link always says **"Open in calendar →"** — never "review queue"

```typescript
function titleFor(n: Notification): string {
  switch (n.type) {
    case 'client_approved_all': return 'approved all posts'
    case 'client_approved_one': return `approved post #${n.postNumber}`
    case 'client_feedback':     return `requested changes on post #${n.postNumber}`
    case 'client_partial':      return 'reviewed some posts'
  }
}

function bodyFor(n: Notification): string {
  switch (n.type) {
    case 'client_approved_all':
      return `${n.approvedCount} posts approved and ready to schedule`
    case 'client_approved_one':
      return `Post #${n.postNumber} approved — ready to schedule`
    case 'client_partial':
      return `${n.approvedCount} approved · ${n.feedbackCount} feedback · ${n.pendingCount} pending`
    default: return ''
  }
}
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Unread: `#FDFAF8` background + terracotta left bar
- [ ] Read: transparent, no bar
- [ ] Feedback text shown only when `feedbackText` exists, truncated at 120 chars
- [ ] Action link text: "Open in calendar →" — NOT "review queue"

---

## Step 6 — Create `NotificationBell`

> **File:** `src/components/layout/notification-bell.tsx`

```typescript
'use client'
// Imports: useRouter, useEffect, useRef,
//          useNotificationStore, useNotifications, NotificationItem
```

Key rules:
- Call `useNotifications()` inside this component — it lives in the layout so polling persists across route changes
- Badge: terracotta when approvals-only unread, red+pulsing when any feedback unread
- Panel closes on outside click (mousedown listener, cleaned up on close)
- "Mark all read": optimistic update to store + `POST /api/notifications`
- All navigation goes to `/calendar` or `/calendar?postId=...`
- Panel footer: "Go to calendar →"
- Section labels: "Today" and "Earlier" (only rendered when non-empty)

```typescript
function isToday(date: Date): boolean {
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth()      === now.getMonth()
    && date.getDate()       === now.getDate()
}
```

### Global CSS (add to `globals.css`)
```css
@keyframes notif-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(180, 50, 50, 0.4); }
  50%       { box-shadow: 0 0 0 4px rgba(180, 50, 50, 0); }
}
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Badge: terracotta for approvals-only, red+pulsing when any feedback unread
- [ ] Panel opens/closes on bell click
- [ ] Outside click closes panel
- [ ] "Mark all read" updates store optimistically + calls API
- [ ] ALL navigation goes to `/calendar` — not review queue, not any other page
- [ ] `useNotifications()` called here (polling starts in layout)

---

## Step 7 — Create Toast components

### `ToastItem`
> **File:** `src/components/notifications/toast-item.tsx`

```typescript
const DISMISS_AFTER = 6000   // milliseconds

// Auto-dismiss
useEffect(() => {
  const id = setTimeout(onDismiss, DISMISS_AFTER)
  return () => clearTimeout(id)   // must clean up on unmount
}, [])
```

Left colour indicator: 3px wide, sage for approved, blue for feedback.
Action button: **"Open in calendar →"** always.

### `ToastContainer`
> **File:** `src/components/notifications/toast-container.tsx`

```typescript
// position: fixed, bottom: 20px, right: 20px, zIndex: 9999
// pointerEvents: 'none' on container, 'auto' on each toast
// Navigate: dismissToast(id) then router.push(`/calendar?postId=...`)
```

### Global CSS (add to `globals.css`)
```css
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Auto-dismisses after 6 seconds, `clearTimeout` on unmount
- [ ] Manual × dismiss works
- [ ] Navigate: dismisses + routes to `/calendar`
- [ ] `pointerEvents: 'none'` on container
- [ ] Entry animation plays

---

## Step 8 — Create `ClientResponseCard`

> **File:** `src/components/calendar/client-response-card.tsx`

Shown at the **top of the calendar post detail panel** when the post has
a client response (`post.clientRespondedAt` is set).

```typescript
interface ClientResponseCardProps {
  response: {
    respondedAt:   Date
    responseType:  'approved' | 'changes_requested'
    feedbackText?: string
  }
  clientName:  string
  onSchedule?: () => void   // approved → open schedule/publish flow
  onRewrite?:  () => void   // feedback → open generate flow with brief pre-filled
}
```

Visual rules:
- Approved: `rgba(90,138,74,0.25)` border, `rgba(90,138,74,0.04)` header bg
- Feedback: `rgba(44,94,138,0.20)` border, `rgba(44,94,138,0.04)` header bg
- No feedback text: italic fallback "Approved as-is" or "No specific feedback provided"
- Approved CTAs: "Schedule to calendar" (sage) + "Archive" (secondary)
- Feedback CTAs: "Rewrite with feedback" (slate) + "Reply to client" (secondary)

### Where it renders in the calendar
```typescript
// In the calendar floating card / post detail — at the TOP of the scrollable body:
{post.clientRespondedAt && (
  <ClientResponseCard
    response={{
      respondedAt:  post.clientRespondedAt,
      responseType: post.clientResponseType!,
      feedbackText: post.clientFeedbackText,
    }}
    clientName={post.client.name}
    onSchedule={() => openScheduleFlow(post)}
    onRewrite={() => openGenerateFlow({ prefillBrief: post.clientFeedbackText })}
  />
)}
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Approved: sage border + header, correct CTAs
- [ ] Feedback: blue border + header, italic quote, correct CTAs
- [ ] No feedback text: italic fallback message renders
- [ ] Card only renders when `post.clientRespondedAt` is set
- [ ] Card is at the TOP of the scrollable body, before caption content

---

## Step 9 — Update server actions

> **Find the files first:**
> ```bash
> find src -name "*.ts" -o -name "*.tsx" \
>   | xargs grep -l "approvePost\|submitFeedback\|approveAll" | head -5
> ```

Add notification creation **after** the existing DB write succeeds.
Do NOT restructure the existing async chain — append only.

```typescript
// After approvePost existing update — ADD:
await db.posts.update({
  where: { id: postId },
  data: {
    client_responded_at:  new Date(),
    client_response_type: 'approved',
  }
})
await createNotification(workspace.id, {
  type:        'client_approved_one',
  clientId:    post.clientId,
  clientName:  post.client.name,
  postId,
  postNumber:  post.number,
  reviewToken: token,
})
```

```typescript
// After submitFeedback existing update — ADD:
await db.posts.update({
  where: { id: postId },
  data: {
    client_responded_at:  new Date(),
    client_response_type: 'changes_requested',
    client_feedback_text: feedbackText,
  }
})
await createNotification(workspace.id, {
  type:         'client_feedback',
  clientId:     post.clientId,
  clientName:   post.client.name,
  postId,
  postNumber:   post.number,
  feedbackText,
  reviewToken:  token,
})
```

```typescript
// After approveAll existing update — ADD single batch notification:
await createNotification(workspace.id, {
  type:          'client_approved_all',
  clientId:      session.clientId,
  clientName:    session.clientName,
  approvedCount: approvedPosts.length,
  reviewToken:   token,
})
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Client approves → `notifications` row created, post fields updated
- [ ] Client submits feedback → `feedback_text` in notification, `client_feedback_text` on post
- [ ] Client approves all → single batch notification row
- [ ] If existing DB write fails, notification is not created (same try block)

---

## Step 10 — Mount in dashboard layout

> **File:** `src/app/(dashboard)/layout.tsx`

```tsx
import { NotificationBell }  from '@/components/layout/notification-bell'
import { ToastContainer }    from '@/components/notifications/toast-container'

// In the topbar, replace the existing bell placeholder (if any):
<NotificationBell />

// At the very end of the layout, before the closing tag:
<ToastContainer />
```

`NotificationBell` mounts `useNotifications()` — polling starts here and
persists across all dashboard route navigations without restarting.

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] Bell visible on all dashboard pages
- [ ] Toasts appear over all dashboard pages (fixed position)
- [ ] Navigating between pages does NOT restart polling
- [ ] No imports from review queue components — zero coupling

---

## Step 11 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Flow test: client approves a post
1. Agency opens dashboard in Tab A
2. Client opens review link in Tab B (or incognito)
3. Client clicks Approve on a post

Within 30 seconds in Tab A:
- [ ] Bell badge increments, terracotta colour
- [ ] Toast: "Client approved post #N · Open in calendar →"
- [ ] Toast auto-dismisses after 6 seconds
- [ ] Opening the calendar: post detail shows `ClientResponseCard` with sage border
- [ ] Card shows "Approved as-is" message
- [ ] "Schedule to calendar" is the primary CTA

### Flow test: client requests changes
1. Same setup
2. Client types feedback message and clicks Request changes

Within 30 seconds in Tab A:
- [ ] Bell badge is red + pulsing
- [ ] Toast: feedback snippet + "Open in calendar →"
- [ ] Opening the calendar: post detail shows `ClientResponseCard` with blue border
- [ ] Client's exact feedback shown in italic quotes
- [ ] "Rewrite with feedback" is the primary CTA

### Visual checks
- [ ] **Zero changes to review queue** — no modified files in review queue folder
- [ ] All navigation (bell panel + toasts) points to `/calendar`
- [ ] Badge: terracotta (approvals only), red+pulsing (any feedback)
- [ ] Toast left indicator: sage for approval, blue for feedback
- [ ] Response card in calendar: correct border/header colour per response type
- [ ] Response card only appears when `post.clientRespondedAt` is set

---

## What is NOT changed

| Item | Why |
|---|---|
| Review queue (all files) | Posts are sent for review from calendar — review queue not in scope |
| Client review page actions (core logic) | Unchanged — notification creation is additive only |
| Auth / session logic | Not in scope |
| Email notifications | Future scope — in-app only for v1 |
| WebSocket / Supabase Realtime | Future upgrade — 30s polling sufficient for v1 |

---

## Implementation order for Claude Code

```
Step 1  → lib/notifications.ts              — DB helpers (verify schema first)
Step 2  → api/notifications/route.ts        — polling endpoint
Step 3  → stores/notification-store.ts      — Zustand store
Step 4  → hooks/use-notifications.ts        — polling hook with first-poll guard
Step 5  → notification-item.tsx             — single row (all nav → /calendar)
Step 6  → notification-bell.tsx             — bell + panel (mounts polling)
Step 7  → toast-item.tsx + toast-container.tsx
Step 8  → calendar/client-response-card.tsx — response card in calendar detail
Step 9  → server actions (additive only)    — notification creation after existing writes
Step 10 → (dashboard)/layout.tsx            — mount bell + toast container
Step 11 → end-to-end verification
```

---

*Kontuur — Client Response Notification System Plan (v2)*
*Review queue removed from scope — posts sent for review from calendar only.*
*Three surfaces: bell panel · toast · calendar post detail response card.*
*All navigation points to /calendar.*
*Server actions unchanged except additive notification creation.*