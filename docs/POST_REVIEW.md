# Client Review Page Redesign — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.
> All existing approval and feedback submission logic unchanged.
> Only visual presentation and layout change.

---

## Context

The current client review page is a simple scrollable list — all posts rendered
sequentially as full-length cards with a fixed footer. With 4+ posts this
becomes unwieldy and clients lose context of what they've reviewed.

This plan redesigns it as a two-panel layout:
- **Left panel (300px):** post list with status badges, pillar dots, preview, date
- **Right panel (flex):** full post detail — caption, slides, feedback input, actions

The page is public/client-facing (no auth sidebar). It lives at a shareable
URL like `/review/[token]` and is accessed directly by clients.

---

## File Structure

| File | Change |
|---|---|
| `src/app/(review)/review/[token]/page.tsx` | UPDATE — two-panel layout |
| `src/components/review-page/review-header.tsx` | CREATE — agency, title, status chips |
| `src/components/review-page/review-filter-bar.tsx` | CREATE — filter + count |
| `src/components/review-page/post-list.tsx` | CREATE — left panel |
| `src/components/review-page/post-list-item.tsx` | CREATE — single list item |
| `src/components/review-page/post-detail.tsx` | CREATE — right panel |
| `src/components/review-page/slides-section.tsx` | CREATE — structured slide list |
| `src/components/review-page/feedback-box.tsx` | CREATE — textarea or read-only |
| `src/components/review-page/action-bar.tsx` | CREATE — approve + request changes |

> **Find actual paths first:**
> ```bash
> find src/app -name "*.tsx" | xargs grep -l "review\|token\|Posts for review" | head -10
> find src -name "*.tsx" | xargs grep -l "approvePost\|requestChanges\|submitFeedback" | head -10
> find src -name "*.tsx" | xargs grep -l "ReviewPost\|ClientPost\|reviewToken" | head -5
> ```

---

## Data Shape

```typescript
interface ReviewSession {
  token:        string
  agencyName:   string
  clientName:   string
  dateRange:    { from: string; to: string }   // formatted
  platform:     string
  posts:        ReviewPost[]
}

interface ReviewPost {
  id:           string
  number:       number          // 1, 2, 3…
  scheduledFor: string          // formatted: 'Sat, Apr 25'
  platform:     string
  postType:     'carousel' | 'single' | 'reel' | 'story'
  slideCount?:  number
  pillar:       string
  pillarColor:  string          // hex
  caption:      string
  hashtags:     string
  slides?:      ReviewSlide[]
  status:       'pending' | 'approved' | 'changes'
  feedback?:    string          // existing feedback if status === 'changes'
}

interface ReviewSlide {
  number:   number
  type:     'Cover' | 'Body' | 'CTA' | string
  headline: string
  body?:    string
}
```

---

## Design Tokens

```
Background:           #F4EFE6   (warm)
Left panel bg:        #ffffff
Right panel bg:       #F4EFE6
Panel border:         0.5px solid rgba(44,62,80,0.10)
Left panel width:     300px fixed

Status colours:
  pending:   background rgba(192,123,85,0.10), text #C07B55
  approved:  background rgba(90,138,74,0.10),  text #5A8A4A
  changes:   background rgba(44,94,138,0.10),  text #2C5F8A

Status chip icons: clock (pending), checkmark (approved), speech bubble (changes)

Header agency label: 10px, #8A8070, letter-spacing 2px, uppercase
Header title font:   Playfair Display, 24px, weight 400

Action buttons:
  Request changes: #F0EDE8 fill, 1px #D4CEC7 border — always visible
  Approve this:    #5A8A4A fill → hover #4A7A3A, white text
  Approve all:     #1A2630 fill → hover #C07B55, right-aligned with margin-left:auto

Feedback box (pending): white bg, normal border
Feedback box (sent):    rgba(44,94,138,0.04) bg, rgba(44,94,138,0.20) border, #2C5F8A label
```

---

## Step 1 — Create `ReviewHeader`

> **File:** `src/components/review-page/review-header.tsx`

```typescript
interface ReviewHeaderProps {
  agencyName:  string
  clientName:  string
  dateRange:   string   // e.g. 'April 25, 2026'
  platform:    string
  totalCount:  number
  pendingCount:  number
  approvedCount: number
  changesCount:  number
}
```

```tsx
<div style={{
  background: '#fff',
  borderBottom: '0.5px solid rgba(44,62,80,0.10)',
  padding: '18px 28px 16px',
  flexShrink: 0,
}}>
  {/* Top row: agency name + date */}
  <div style={{ display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: '14px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '10px', fontWeight: 500, color: '#8A8070',
      letterSpacing: '2px', textTransform: 'uppercase' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%',
        background: '#C07B55' }}/>
      {agencyName}
    </div>
    <div style={{ fontSize: '11px', color: '#8A8070',
      background: '#F4EFE6', border: '0.5px solid rgba(44,62,80,0.12)',
      padding: '4px 10px', borderRadius: '6px' }}>
      {/* Current date from server or session */}
      {formattedDate}
    </div>
  </div>

  {/* Title */}
  <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '24px', fontWeight: 400, color: '#1A2630', marginBottom: '6px' }}>
    Posts for review
  </div>

  {/* Meta */}
  <div style={{ fontSize: '12px', color: '#8A8070',
    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
    <span>{clientName}</span>
    <span style={{ color: 'rgba(44,62,80,0.20)' }}>·</span>
    <span>{dateRange}</span>
    <span style={{ color: 'rgba(44,62,80,0.20)' }}>·</span>
    <span>{platform}</span>
  </div>

  {/* Status chips */}
  <div style={{ display: 'flex', gap: '7px', marginTop: '12px' }}>
    <StatusChip icon="grid"    label={`${totalCount} posts`}   colour="total" />
    <StatusChip icon="clock"   label={`${pendingCount} pending`}  colour="pending" />
    <StatusChip icon="check"   label={`${approvedCount} approved`} colour="approved" />
    <StatusChip icon="bubble"  label={`${changesCount} feedback sent`} colour="changes" />
  </div>
</div>
```

### `StatusChip`
```typescript
type ChipColour = 'total' | 'pending' | 'approved' | 'changes'

const CHIP_STYLES: Record<ChipColour, { bg: string; color: string }> = {
  total:    { bg: 'rgba(44,62,80,0.07)',   color: '#1A2630' },
  pending:  { bg: 'rgba(192,123,85,0.10)', color: '#C07B55' },
  approved: { bg: 'rgba(90,138,74,0.10)',  color: '#5A8A4A' },
  changes:  { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
}

function StatusChip({ icon, label, colour }) {
  const s = CHIP_STYLES[colour]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
      fontWeight: 500, background: s.bg, color: s.color }}>
      <ChipIcon type={icon} />
      {label}
    </div>
  )
}
```

Hide zero-count chips:
```typescript
{pendingCount > 0 && <StatusChip ... />}
{approvedCount > 0 && <StatusChip ... />}
{changesCount > 0 && <StatusChip ... />}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Agency dot + name renders in muted uppercase
- [ ] Title in Playfair Display, 24px
- [ ] Status chips only shown for non-zero counts
- [ ] Chip colours match the token spec above

---

## Step 2 — Create `ReviewFilterBar`

> **File:** `src/components/review-page/review-filter-bar.tsx`

```typescript
type PostFilter = 'all' | 'pending' | 'approved' | 'changes'

interface ReviewFilterBarProps {
  activeFilter:   PostFilter
  onFilterChange: (f: PostFilter) => void
  visibleCount:   number
}
```

```tsx
<div style={{
  background: '#fff',
  borderBottom: '0.5px solid rgba(44,62,80,0.10)',
  display: 'flex', alignItems: 'center',
  padding: '0 28px', gap: '6px', height: '40px', flexShrink: 0,
}}>
  {(['all', 'pending', 'approved', 'changes'] as PostFilter[]).map(f => (
    <button key={f} onClick={() => onFilterChange(f)} style={{
      padding: '5px 12px', borderRadius: '6px',
      fontSize: '11px', fontWeight: 500, cursor: 'pointer',
      border: 'none', fontFamily: 'inherit', transition: 'all 0.15s',
      background: activeFilter === f ? '#1A2630' : 'none',
      color:      activeFilter === f ? '#ECE8E1' : '#8A8070',
    }}>
      {f === 'all'      ? 'All'
     : f === 'pending'  ? 'Pending'
     : f === 'approved' ? 'Approved'
     : 'Feedback sent'}
    </button>
  ))}

  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#8A8070' }}>
    {visibleCount} posts
  </span>
</div>
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Active filter: slate background, cream text
- [ ] Inactive filters: no background, muted text
- [ ] Count updates when filter changes

---

## Step 3 — Create `PostListItem`

> **File:** `src/components/review-page/post-list-item.tsx`

```typescript
interface PostListItemProps {
  post:      ReviewPost
  isActive:  boolean
  onClick:   () => void
}
```

```tsx
<div
  onClick={onClick}
  style={{
    padding:      '13px 16px',
    borderBottom: '0.5px solid rgba(44,62,80,0.055)',
    cursor:       'pointer',
    background:   isActive ? 'rgba(44,62,80,0.03)' : 'transparent',
    position:     'relative', overflow: 'hidden',
    transition:   'background 0.12s',
  }}
  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F9F6F2' }}
  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
>
  {/* Active indicator */}
  {isActive && (
    <div style={{ position: 'absolute', left: 0, top: '12%', bottom: '12%',
      width: '2.5px', background: '#C07B55', borderRadius: '0 2px 2px 0' }}/>
  )}

  {/* Row 1: number · date · platform badge */}
  <div style={{ display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: '4px' }}>
    <span style={{ fontSize: '10px', fontWeight: 500, color: '#8A8070' }}>
      #{post.number}
    </span>
    <span style={{ fontSize: '10px', color: '#8A8070' }}>
      {post.scheduledFor}
    </span>
    <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 7px',
      borderRadius: '3px', background: 'rgba(192,123,85,0.12)',
      color: '#C07B55' }}>
      {post.platform}
    </span>
  </div>

  {/* Row 2: pillar + type */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '5px',
    marginBottom: '5px', flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: 500, color: '#1A2630' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%',
        background: post.pillarColor, flexShrink: 0 }}/>
      {post.pillar}
    </div>
    <span style={{ fontSize: '10px', color: '#8A8070' }}>
      · {post.postType === 'carousel'
        ? `Carousel · ${post.slideCount} slides`
        : post.postType === 'single' ? 'Single image'
        : post.postType === 'reel'   ? 'Reel script'
        : 'Story caption'}
    </span>
  </div>

  {/* Row 3: caption preview */}
  <div style={{ fontSize: '11px', color: '#8A8070', lineHeight: 1.4,
    display: '-webkit-box', WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '7px' }}>
    {post.caption}
  </div>

  {/* Row 4: status badge */}
  <PostStatusBadge status={post.status} />
</div>
```

### `PostStatusBadge`
```typescript
function PostStatusBadge({ status }: { status: ReviewPost['status'] }) {
  const styles = {
    pending:  { bg: 'rgba(192,123,85,0.10)', color: '#C07B55', label: 'Pending review',  icon: 'clock' },
    approved: { bg: 'rgba(90,138,74,0.10)',  color: '#5A8A4A', label: 'Approved',        icon: 'check' },
    changes:  { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A', label: 'Feedback sent',   icon: 'bubble' },
  }
  const s = styles[status]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px',
      background: s.bg, color: s.color }}>
      <StatusIcon type={s.icon} size={9} />
      {s.label}
    </div>
  )
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Active item: terracotta left bar, slightly darker background
- [ ] Status badge colour matches status
- [ ] Caption truncates at 2 lines
- [ ] Hover: faint warm background on non-active items

---

## Step 4 — Create `PostList`

> **File:** `src/components/review-page/post-list.tsx`

```typescript
interface PostListProps {
  posts:          ReviewPost[]
  activePostId:   string | null
  onSelect:       (id: string) => void
}
```

```tsx
<div style={{
  width: '300px', flexShrink: 0, background: '#fff',
  borderRight: '0.5px solid rgba(44,62,80,0.10)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}}>
  <div style={{ padding: '10px 16px',
    borderBottom: '0.5px solid rgba(44,62,80,0.07)',
    font: '9px/1 var(--font-sans)', fontWeight: 500, color: '#8A8070',
    letterSpacing: '1.5px', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0 }}>
    <span>Posts</span>
    <span>{posts.length} total</span>
  </div>

  <div style={{ flex: 1, overflowY: 'auto' }}>
    {posts.map(post => (
      <PostListItem
        key={post.id}
        post={post}
        isActive={post.id === activePostId}
        onClick={() => onSelect(post.id)}
      />
    ))}
    {posts.length === 0 && (
      <div style={{ padding: '40px 20px', textAlign: 'center',
        fontSize: '12px', color: '#8A8070', fontStyle: 'italic' }}>
        No posts match this filter
      </div>
    )}
  </div>
</div>
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All posts render with correct status badges
- [ ] Clicking a post calls `onSelect` with the correct id
- [ ] Empty state shown when filtered list is empty

---

## Step 5 — Create `SlidesSection`

> **File:** `src/components/review-page/slides-section.tsx`

```typescript
interface SlidesSectionProps {
  slides:     ReviewSlide[]
  slideCount: number
}
```

```tsx
<div style={{
  background: '#fff',
  border: '0.5px solid rgba(44,62,80,0.10)',
  borderRadius: '12px', overflow: 'hidden',
}}>
  {/* Header */}
  <div style={{ display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '0.5px solid rgba(44,62,80,0.07)' }}>
    <span style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
      letterSpacing: '1px', textTransform: 'uppercase' }}>
      Slides
    </span>
    <span style={{ fontSize: '10px', color: '#8A8070' }}>
      {slideCount} slides
    </span>
  </div>

  {/* Slide items */}
  {slides.map((slide, i) => (
    <div key={i} style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '14px 16px',
      borderBottom: i < slides.length - 1
        ? '0.5px solid rgba(44,62,80,0.06)'
        : 'none',
    }}>
      {/* Number column */}
      <div style={{ fontSize: '10px', fontWeight: 500, color: '#8A8070',
        width: '52px', flexShrink: 0, paddingTop: '2px' }}>
        Slide {slide.number}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
          letterSpacing: '0.5px', textTransform: 'uppercase',
          marginBottom: '3px' }}>
          {slide.type}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630',
          lineHeight: 1.45, marginBottom: slide.body ? '4px' : 0 }}>
          {slide.headline}
        </div>
        {slide.body && (
          <div style={{ fontSize: '12px', color: '#8A8070', lineHeight: 1.6 }}>
            {slide.body}
          </div>
        )}
      </div>
    </div>
  ))}
</div>
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Each slide: number column (52px), type badge, headline, optional body
- [ ] Last slide has no bottom border
- [ ] Body text only rendered when present
- [ ] Section hidden entirely when `slides` is empty (single image posts)

---

## Step 6 — Create `FeedbackBox`

> **File:** `src/components/review-page/feedback-box.tsx`

Two states: input (for pending posts) and read-only (for posts with existing feedback).

```typescript
interface FeedbackBoxProps {
  mode:      'input' | 'read-only'
  value?:    string         // existing feedback text for read-only
  onChange?: (v: string) => void
}
```

```tsx
{mode === 'read-only' ? (
  /* Existing feedback — shown when status === 'changes' */
  <div style={{
    background: 'rgba(44,94,138,0.04)',
    border: '0.5px solid rgba(44,94,138,0.20)',
    borderRadius: '12px', padding: '14px 16px',
  }}>
    <div style={{ fontSize: '10px', fontWeight: 500, color: '#2C5F8A',
      marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
      [speech bubble icon 11px #2C5F8A]
      Feedback you sent
    </div>
    <div style={{ fontSize: '13px', color: '#1A2630', lineHeight: 1.6 }}>
      {value}
    </div>
  </div>
) : (
  /* Input — shown for pending posts */
  <div style={{
    background: '#fff',
    border: '0.5px solid rgba(44,62,80,0.10)',
    borderRadius: '12px', padding: '14px 16px',
  }}>
    <div style={{ fontSize: '10px', fontWeight: 500, color: '#8A8070',
      marginBottom: '8px' }}>
      Leave feedback (optional)
    </div>
    <textarea
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder="e.g. Can we soften the tone on slide 2? Also please add the clinic's phone number to the CTA slide..."
      rows={3}
      style={{
        width: '100%', padding: '9px 12px',
        border: '1px solid rgba(44,62,80,0.16)',
        borderRadius: '8px', fontSize: '13px',
        fontFamily: 'inherit', color: '#1A2630',
        background: '#fff', outline: 'none',
        resize: 'none', lineHeight: 1.55,
        transition: 'border-color 0.15s',
      }}
    />
  </div>
)}
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Read-only: blue-tinted card, "Feedback you sent" label, existing text
- [ ] Input: white card, textarea, placeholder text
- [ ] Textarea grows with content (CSS: height auto is acceptable)
- [ ] Approved posts: neither mode shown — the component is not rendered

---

## Step 7 — Create `ActionBar`

> **File:** `src/components/review-page/action-bar.tsx`

```typescript
interface ActionBarProps {
  currentPost:     ReviewPost
  totalPending:    number
  onApprove:       () => Promise<void>
  onRequestChanges: (feedback: string) => Promise<void>
  onApproveAll:    () => Promise<void>
  feedback:        string   // current feedback textarea value
  isApproving:     boolean
  isSubmitting:    boolean
}
```

```tsx
<div style={{
  padding: '12px 22px', background: '#fff',
  borderTop: '0.5px solid rgba(44,62,80,0.07)',
  display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
}}>

  {/* Already actioned — show status instead of buttons */}
  {currentPost.status === 'approved' && (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '12px', fontWeight: 500, color: '#5A8A4A' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      This post has been approved
    </div>
  )}

  {currentPost.status === 'changes' && (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '12px', fontWeight: 500, color: '#2C5F8A' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      Feedback sent — waiting for the agency to update
    </div>
  )}

  {/* Pending actions */}
  {currentPost.status === 'pending' && (
    <>
      <button
        onClick={() => onRequestChanges(feedback)}
        disabled={isSubmitting}
        style={{
          padding: '10px 18px', background: '#F0EDE8',
          border: '1px solid #D4CEC7', borderRadius: '9px',
          fontSize: '12px', fontWeight: 500, color: '#3A4A54',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: '6px',
          opacity: isSubmitting ? 0.7 : 1, transition: 'all 0.15s',
        }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {isSubmitting ? 'Sending…' : 'Request changes'}
      </button>

      <button
        onClick={onApprove}
        disabled={isApproving}
        style={{
          padding: '10px 20px', background: '#5A8A4A', color: '#fff',
          border: 'none', borderRadius: '9px', fontSize: '12px',
          fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: '6px',
          opacity: isApproving ? 0.7 : 1, transition: 'all 0.15s',
        }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        {isApproving ? 'Approving…' : 'Approve this post'}
      </button>
    </>
  )}

  {/* Approve all — always shown when pending posts remain */}
  {totalPending > 0 && (
    <button
      onClick={onApproveAll}
      disabled={isApproving}
      style={{
        padding: '10px 20px', background: '#1A2630', color: '#ECE8E1',
        border: 'none', borderRadius: '9px', fontSize: '12px',
        fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
        marginLeft: 'auto', transition: 'background 0.15s',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
      Approve all {totalPending} posts →
    </button>
  )}
</div>
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Pending: "Request changes" + "Approve this post" + "Approve all N"
- [ ] Approved: status message, no action buttons, "Approve all" still shown if others pending
- [ ] Changes: feedback-sent message, no action buttons
- [ ] "Approve all" count reflects remaining pending count only
- [ ] Buttons disabled while loading, show loading text

---

## Step 8 — Create `PostDetail`

> **File:** `src/components/review-page/post-detail.tsx`

```typescript
interface PostDetailProps {
  post:            ReviewPost
  postIndex:       number    // 0-based current position
  totalPosts:      number
  feedback:        string
  onFeedbackChange: (v: string) => void
  onNavigate:      (dir: 1 | -1) => void
  onApprove:       () => Promise<void>
  onRequestChanges: (feedback: string) => Promise<void>
  onApproveAll:    () => Promise<void>
  totalPending:    number
  isApproving:     boolean
  isSubmitting:    boolean
}
```

```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column',
  overflow: 'hidden', minWidth: 0 }}>

  {/* Meta topbar */}
  <div style={{ padding: '10px 20px', background: '#fff',
    borderBottom: '0.5px solid rgba(44,62,80,0.07)',
    display: 'flex', alignItems: 'center', gap: '7px',
    flexShrink: 0, flexWrap: 'wrap' }}>
    <MetaPill label={`#${post.number}`} variant="num" />
    <MetaPill label={post.scheduledFor} variant="date" />
    <MetaPill label={post.platform} variant="ig" />
    <MetaPill label={postTypeLabel(post)} variant="type" />
    <MetaPill label={post.pillar} variant="pillar" dot={post.pillarColor} />
    {post.status === 'approved' && (
      <MetaPill label="Approved" variant="approved" />
    )}
    {post.status === 'changes' && (
      <MetaPill label="Feedback sent" variant="changes" />
    )}

    {/* Navigation arrows */}
    <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
      <NavArrowButton onClick={() => onNavigate(-1)}
        disabled={postIndex === 0} direction="prev" />
      <NavArrowButton onClick={() => onNavigate(1)}
        disabled={postIndex === totalPosts - 1} direction="next" />
    </div>
  </div>

  {/* Scrollable content */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px',
    display: 'flex', flexDirection: 'column', gap: '12px',
    background: '#F4EFE6' }}>

    {/* Caption */}
    <div style={{ background: '#fff', border: '0.5px solid rgba(44,62,80,0.10)',
      borderRadius: '12px', padding: '16px 18px' }}>
      <div style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
        letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Caption
        <button onClick={() => navigator.clipboard?.writeText(post.caption)}
          style={{ fontSize: '10px', color: '#C07B55', fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit' }}>
          Copy
        </button>
      </div>
      <div style={{ fontSize: '14px', color: '#1A2630', lineHeight: 1.72,
        marginBottom: '8px' }}>
        {post.caption}
      </div>
      <div style={{ fontSize: '12px', color: '#8A8070' }}>
        {post.hashtags}
      </div>
    </div>

    {/* Slides — only for carousel/reel */}
    {post.slides && post.slides.length > 0 && (
      <SlidesSection slides={post.slides} slideCount={post.slideCount!} />
    )}

    {/* Feedback — not shown for approved posts */}
    {post.status !== 'approved' && (
      <FeedbackBox
        mode={post.status === 'changes' ? 'read-only' : 'input'}
        value={post.status === 'changes' ? post.feedback : feedback}
        onChange={post.status === 'pending' ? onFeedbackChange : undefined}
      />
    )}
  </div>

  {/* Action bar */}
  <ActionBar
    currentPost={post}
    totalPending={totalPending}
    onApprove={onApprove}
    onRequestChanges={onRequestChanges}
    onApproveAll={onApproveAll}
    feedback={feedback}
    isApproving={isApproving}
    isSubmitting={isSubmitting}
  />
</div>
```

### `postTypeLabel` helper
```typescript
function postTypeLabel(post: ReviewPost): string {
  switch (post.postType) {
    case 'carousel': return `Carousel · ${post.slideCount} slides`
    case 'single':   return 'Single image'
    case 'reel':     return 'Reel script'
    case 'story':    return 'Story caption'
  }
}
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Meta topbar shows all pills + status pill when approved/changes
- [ ] ← → navigation calls `onNavigate`
- [ ] Caption renders with copy button
- [ ] Slides section hidden for single image posts
- [ ] Feedback box shows input for pending, read-only for changes, hidden for approved
- [ ] Action bar mounted below scrollable content

---

## Step 9 — Wire up the page

> **File:** `src/app/(review)/review/[token]/page.tsx`

Keep all existing data fetching, approval, and feedback submission logic unchanged.
Replace the JSX with the new two-panel layout.

### Client state
```typescript
'use client'

const [activePostId, setActivePostId]   = useState<string | null>(null)
const [activeFilter, setActiveFilter]   = useState<PostFilter>('all')
const [feedback, setFeedback]           = useState('')
const [isApproving, setIsApproving]     = useState(false)
const [isSubmitting, setIsSubmitting]   = useState(false)

// Derived
const filteredPosts = posts.filter(p => {
  if (activeFilter === 'all')      return true
  if (activeFilter === 'pending')  return p.status === 'pending'
  if (activeFilter === 'approved') return p.status === 'approved'
  if (activeFilter === 'changes')  return p.status === 'changes'
  return true
})

const activePost  = filteredPosts.find(p => p.id === activePostId)
  ?? filteredPosts[0]
  ?? null
const activeIndex = filteredPosts.findIndex(p => p.id === activePostId)
const totalPending = posts.filter(p => p.status === 'pending').length

// Auto-select first post on load
useEffect(() => {
  if (posts.length > 0 && !activePostId) {
    setActivePostId(posts[0].id)
  }
}, [posts])

// Reset feedback when switching posts
useEffect(() => {
  setFeedback('')
}, [activePostId])
```

### Navigation
```typescript
function handleNavigate(dir: 1 | -1) {
  const nextIndex = activeIndex + dir
  const next = filteredPosts[nextIndex]
  if (next) setActivePostId(next.id)
}
```

### Handlers (wrap existing logic)
```typescript
async function handleApprove() {
  if (!activePost) return
  setIsApproving(true)
  try {
    await approvePost(activePost.id)   // existing handler
    // Auto-advance to next pending post
    const nextPending = filteredPosts.find(
      p => p.id !== activePost.id && p.status === 'pending'
    )
    if (nextPending) setActivePostId(nextPending.id)
  } finally {
    setIsApproving(false)
  }
}

async function handleRequestChanges(feedbackText: string) {
  if (!activePost || !feedbackText.trim()) return
  setIsSubmitting(true)
  try {
    await submitFeedback(activePost.id, feedbackText)   // existing handler
    setFeedback('')
  } finally {
    setIsSubmitting(false)
  }
}

async function handleApproveAll() {
  setIsApproving(true)
  try {
    await approveAllPosts()   // existing handler
  } finally {
    setIsApproving(false)
  }
}
```

### Page JSX
```tsx
<div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', background: '#F4EFE6' }}>

  <ReviewHeader
    agencyName={session.agencyName}
    clientName={session.clientName}
    dateRange={session.dateRange}
    platform={session.platform}
    totalCount={posts.length}
    pendingCount={posts.filter(p => p.status === 'pending').length}
    approvedCount={posts.filter(p => p.status === 'approved').length}
    changesCount={posts.filter(p => p.status === 'changes').length}
  />

  <ReviewFilterBar
    activeFilter={activeFilter}
    onFilterChange={f => {
      setActiveFilter(f)
      // Auto-select first post in new filter
      const first = posts.find(p =>
        f === 'all' ? true :
        f === 'pending'  ? p.status === 'pending' :
        f === 'approved' ? p.status === 'approved' :
        p.status === 'changes'
      )
      if (first) setActivePostId(first.id)
    }}
    visibleCount={filteredPosts.length}
  />

  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
    <PostList
      posts={filteredPosts}
      activePostId={activePost?.id ?? null}
      onSelect={id => { setActivePostId(id); setFeedback('') }}
    />

    {activePost ? (
      <PostDetail
        post={activePost}
        postIndex={activeIndex}
        totalPosts={filteredPosts.length}
        feedback={feedback}
        onFeedbackChange={setFeedback}
        onNavigate={handleNavigate}
        onApprove={handleApprove}
        onRequestChanges={handleRequestChanges}
        onApproveAll={handleApproveAll}
        totalPending={totalPending}
        isApproving={isApproving}
        isSubmitting={isSubmitting}
      />
    ) : (
      /* All posts actioned */
      <div style={{ flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: '12px',
        padding: '40px', background: '#F4EFE6' }}>
        <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: '20px', fontWeight: 400, color: '#1A2630', marginBottom: '6px' }}>
          All done
        </div>
        <div style={{ fontSize: '13px', color: '#8A8070', textAlign: 'center' }}>
          All posts have been reviewed. The agency will be notified.
        </div>
      </div>
    )}
  </div>
</div>
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] First post auto-selected on page load
- [ ] Switching filters auto-selects first post in new filter
- [ ] Feedback resets when switching posts
- [ ] After approving a post, next pending post auto-selected
- [ ] All posts reviewed → "All done" empty state

---

## Step 10 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Header: agency dot, title in Playfair Display, status chips correct colours
- [ ] Filter bar: active filter is slate, others are muted
- [ ] Left panel: all posts listed, status badge colours match
- [ ] Active post: terracotta left bar, subtle background
- [ ] Meta topbar pills: all render correctly
- [ ] Caption: 14px, line-height 1.72, copy button
- [ ] Slides: numbered, type badge, headline, optional body
- [ ] Feedback box: input (pending), read-only blue (changes), hidden (approved)
- [ ] Action bar: correct buttons per status

### Functional checks
- [ ] Filter: All / Pending / Approved / Feedback sent narrow the list correctly
- [ ] ← → navigation moves between filtered posts
- [ ] Approve: status updates, next pending auto-selected
- [ ] Request changes: requires feedback text, submits and shows read-only
- [ ] Approve all: all pending posts marked approved
- [ ] Copy button copies caption to clipboard
- [ ] Public page accessible without auth (token-based access)

---

## What is NOT changed

| Item | Why |
|---|---|
| `approvePost` server action / route | Logic unchanged |
| `submitFeedback` server action | Logic unchanged |
| `approveAllPosts` handler | Logic unchanged |
| Token verification / auth | Not in scope |
| Email notifications to agency | Not in scope |
| PDF export of review | Not in scope |

---

## Implementation order for Claude Code

```
Step 1  → review-header.tsx         — status chips, Playfair title
Step 2  → review-filter-bar.tsx     — filter pills
Step 3  → post-list-item.tsx        — single list card
Step 4  → post-list.tsx             — left panel container
Step 5  → slides-section.tsx        — structured slide list
Step 6  → feedback-box.tsx          — input + read-only states
Step 7  → action-bar.tsx            — approve / request changes / approve all
Step 8  → post-detail.tsx           — right panel (assembles 5+6+7)
Step 9  → review/[token]/page.tsx   — wire everything
Step 10 → end-to-end verification
```

---

*Kontuur — Client Review Page Redesign Plan*
*Two-panel layout: post list (300px) + post detail (flex).*
*All existing approval and feedback submission logic unchanged.*
*Feedback box: input for pending, read-only for sent, hidden for approved.*
*Approve all button always reflects remaining pending count.*