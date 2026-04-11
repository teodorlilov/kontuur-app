# Kontuur Style Guide

> **For Claude Code:** Read this entire file before writing any UI component.
> Every colour, font size, spacing value, and component pattern is defined here.
> Never use Tailwind defaults that conflict with this guide.

---

## Philosophy

**Warm precision.** Later.com's warmth × Linear's density × Playfair's editorial identity.

- **Content first** — posts, data, and clients are the thing. UI recedes.
- **Calm confidence** — status colours are muted, never alarming. No aggressive CTAs.
- **Considered motion** — animations confirm actions, guide attention. Nothing moves for decoration.

---

## Tech Stack

- **Framework:** Next.js 14 App Router
- **Styling:** Tailwind CSS + custom CSS variables
- **Components:** Radix UI primitives + custom styles (not shadcn defaults)
- **Animation:** Framer Motion
- **Charts:** Recharts
- **Icons:** Lucide React (stroke icons, 16px default)
- **Fonts:** Geist Sans (UI) + Playfair Display (display/titles only)

---

## Colours

### CSS Variables — add to `globals.css`

```css
:root {
  /* Backgrounds */
  --color-page: #f9f7f4; /* main page bg — never pure white */
  --color-surface: #ffffff; /* card surfaces */
  --color-sunken: #f2f0ec; /* inset areas, table headers, code blocks */
  --color-overlay: rgba(26, 25, 24, 0.04); /* hover bg on white surfaces */

  /* Brand */
  --color-brand: #2c3e50; /* sidebar, primary buttons */
  --color-brand-hover: #3d5166; /* brand hover state */
  --color-brand-accent: #4a6fa5; /* links, chart primary, mark blocks */
  --color-brand-light: rgba(74, 111, 165, 0.12); /* focus ring fill */

  /* Text */
  --color-text-1: #1a1918; /* primary — headings, values, body */
  --color-text-2: #6b6862; /* secondary — descriptions, form labels */
  --color-text-3: #9c9890; /* tertiary — hints, timestamps, placeholders */
  --color-text-inv: #ffffff; /* text on dark/brand backgrounds */

  /* Borders */
  --color-border-1: #eae8e3; /* default — card edges, dividers, table rows */
  --color-border-2: #d4d1ca; /* emphasis — input borders */
  --color-border-3: #b8b5ae; /* strong — active/focused inputs */

  /* Status — intentionally muted */
  --color-published-bg: #eaf3de;
  --color-published-fg: #27500a;
  --color-scheduled-bg: #eef2ff;
  --color-scheduled-fg: #3c3489;
  --color-pending-bg: #faeeda;
  --color-pending-fg: #633806;
  --color-draft-bg: #f2f0ec;
  --color-draft-fg: #6b6862;
  --color-error-bg: #fcebeb;
  --color-error-fg: #791f1f;

  /* Charts */
  --color-chart-1: #4a6fa5; /* primary series */
  --color-chart-2: #1d9e75; /* secondary series */
  --color-chart-3: #ba7517; /* tertiary series */
  --color-chart-grid: #eae8e3;
  --color-chart-label: #9c9890;

  /* Radius */
  --radius-xs: 4px; /* badge corners */
  --radius-sm: 6px; /* small buttons, dropdown items */
  --radius-md: 8px; /* buttons, inputs, standard elements */
  --radius-lg: 12px; /* cards */
  --radius-xl: 16px; /* modals, large cards */
  --radius-full: 9999px; /* pills, avatars, progress bars */

  /* Sidebar (always dark) */
  --sidebar-bg: #2c3e50;
  --sidebar-text: rgba(255, 255, 255, 0.55);
  --sidebar-text-hover: rgba(255, 255, 255, 0.85);
  --sidebar-text-active: rgba(255, 255, 255, 1);
  --sidebar-item-bg-hover: rgba(255, 255, 255, 0.07);
  --sidebar-item-bg-active: rgba(255, 255, 255, 0.12);
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-badge-bg: rgba(255, 255, 255, 0.15);
  --sidebar-badge-text: rgba(255, 255, 255, 0.8);
}
```

### Colour usage rules

| Use case        | Value     | Never use                        |
| --------------- | --------- | -------------------------------- |
| Page background | `#F9F7F4` | `#FFFFFF`, `gray-50`, `gray-100` |
| Card surface    | `#FFFFFF` | `gray-50`                        |
| Card border     | `#EAE8E3` | `gray-200`                       |
| Primary button  | `#2C3E50` | `blue-500`, `blue-600`           |
| Link / accent   | `#4A6FA5` | `blue-500`                       |
| Body text       | `#1A1918` | `gray-900`, `black`              |
| Muted text      | `#9C9890` | `gray-400`, `gray-500`           |
| Sidebar         | `#2C3E50` | `gray-900`, `slate-800`          |

---

## Typography

### Font installation

```typescript
// app/layout.tsx
import { Geist } from 'next/font/google'
import { Playfair_Display } from 'next/font/google'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
})

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext', 'cyrillic'],  // cyrillic required for Bulgarian
  variable: '--font-display',
  weight: ['400', '500'],
})

export default function RootLayout({ children }) {
  return (
    <html className={`${geist.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

### Base styles

```css
/* globals.css */
body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-1);
  background: var(--color-page);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### Type scale

| Token          | Size    | Weight  | Font         | Use                                       |
| -------------- | ------- | ------- | ------------ | ----------------------------------------- |
| `text-2xs`     | 10px    | 500     | Geist        | Table column headers (uppercase, +0.07em) |
| `text-xs`      | 11px    | 400/500 | Geist        | Badges, timestamps                        |
| `text-sm`      | 12px    | 400     | Geist        | Hints, captions, secondary descriptions   |
| `text-base`    | 13.5px  | 400     | Geist        | Body text, nav items, table cells         |
| `text-md`      | 15px    | 500     | Geist        | Card titles, section headings             |
| `text-lg`      | 18px    | 400     | Geist        | Sub-section headings                      |
| `text-xl`      | 22px    | 400     | Geist        | Small stat numbers                        |
| `text-2xl`     | 32px    | 400     | Geist        | Large stat numbers                        |
| `text-display` | 28px    | 400     | **Playfair** | Page titles                               |
| `text-hero`    | 52–64px | 400     | **Playfair** | Landing page hero                         |

### Rules

- **Playfair Display** is used ONLY for page titles and the landing page hero. Never for body text, labels, buttons, or UI elements.
- **Never use font-weight 600 or 700.** Maximum weight is 500. Heavy weights look clunky.
- **Letter spacing on page titles:** `-0.02em`
- **Letter spacing on stat numbers:** `-0.02em`
- **Letter spacing on uppercase labels:** `+0.07em`
- Table column headers are always `10px`, `500 weight`, `uppercase`, `+0.07em`, `color: var(--color-text-3)`

---

## Spacing

Use these values exclusively. Do not invent intermediate values.

```
4px   — icon gap, badge internal padding
8px   — tight element gap, inline spacing
12px  — component internal gap
16px  — standard gap, section padding
20px  — card padding
24px  — card padding (wider), section gap
32px  — section separation
40px  — page horizontal padding
48px  — section vertical margin
64px  — large section separation
```

**Page layout:**

- Page padding: `40px` horizontal
- Max content width: `1280px`
- Sidebar width: `224px`
- Card padding: `20px 24px`

---

## Layout

### App shell

```
┌─────────┬──────────────────────────────────────┐
│ Sidebar │ Main content area                    │
│ 224px   │ background: var(--color-page)         │
│ #2C3E50 │ padding: 36px 40px                   │
└─────────┴──────────────────────────────────────┘
```

### Page structure

```tsx
<div className="flex h-screen">
  <Sidebar />
  <main className="flex-1 overflow-y-auto bg-[#F9F7F4] p-10">
    <PageHeader /> {/* title + date + action buttons */}
    <StatCards /> {/* 4-column grid */}
    <ContentArea /> {/* cards, tables, charts */}
  </main>
</div>
```

---

## Sidebar

```tsx
// Structure
<aside style={{ background: 'var(--sidebar-bg)', width: 224 }}>
  <div className="logo-area">
    {' '}
    {/* padding: 26px 22px 18px */}
    <KontuurLogo />
  </div>
  <div className="divider" /> {/* 0.5px, rgba(255,255,255,0.08) */}
  <nav>
    <SectionLabel>Workspace</SectionLabel>
    <NavItem href="/dashboard" active>
      Dashboard
    </NavItem>
    <NavItem href="/clients">Clients</NavItem>
    <NavItem href="/generate">Generate posts</NavItem>
    <NavItem href="/review" badge={3}>
      Review queue
    </NavItem>
    <SectionLabel>Insights</SectionLabel>
    <NavItem href="/calendar">Calendar</NavItem>
    <NavItem href="/analytics">Analytics</NavItem>
  </nav>
  <div className="sidebar-footer">
    {' '}
    {/* margin-top: auto */}
    <UserRow />
  </div>
</aside>
```

```css
.nav-section-label {
  padding: 20px 22px 6px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.25);
  font-family: var(--font-sans);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 22px;
  font-size: 13.5px;
  color: var(--sidebar-text);
  cursor: pointer;
  transition:
    color 120ms ease,
    background 120ms ease;
}
.nav-item:hover {
  color: var(--sidebar-text-hover);
  background: var(--sidebar-item-bg-hover);
}
.nav-item.active {
  color: var(--sidebar-text-active);
  background: var(--sidebar-item-bg-active);
}
.nav-badge {
  margin-left: auto;
  background: var(--sidebar-badge-bg);
  color: var(--sidebar-badge-text);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
}
```

---

## Cards

### Base card

```css
.card {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg); /* 12px */
  padding: 20px 24px;
}
```

### Metric card

```css
.metric-card {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  transition:
    border-color 150ms ease,
    transform 150ms ease;
}
.metric-card:hover {
  border-color: var(--color-border-2);
  transform: translateY(-1px);
}
.metric-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-3);
  margin-bottom: 10px;
}
.metric-value {
  font-size: 32px;
  font-weight: 400;
  color: var(--color-text-1);
  line-height: 1;
  letter-spacing: -0.02em;
}
.metric-delta {
  font-size: 12px;
  margin-top: 6px;
}
.metric-delta.up {
  color: var(--color-published-fg);
}
.metric-delta.down {
  color: var(--color-error-fg);
}
.metric-delta.neutral {
  color: var(--color-text-3);
}
```

### Post card (review queue)

```css
.post-card {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  transition:
    border-color 150ms ease,
    box-shadow 200ms ease;
  cursor: pointer;
}
.post-card:hover {
  border-color: var(--color-border-2);
  box-shadow: 0 2px 12px rgba(26, 25, 24, 0.06);
}
.post-card.selected {
  border-color: var(--color-brand-accent);
  box-shadow: 0 0 0 3px var(--color-brand-light);
}
```

---

## Buttons

Four variants. Use exactly these — no custom colour combinations.

```css
/* Base */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    transform 100ms ease;
  border: none;
  white-space: nowrap;
  line-height: 1;
}
.btn:active {
  transform: scale(0.98);
}

/* Primary — use for the single main action on a page */
.btn-primary {
  background: var(--color-brand);
  color: var(--color-text-inv);
}
.btn-primary:hover {
  background: var(--color-brand-hover);
}

/* Secondary — use for secondary actions, destructive confirmations */
.btn-secondary {
  background: transparent;
  color: var(--color-text-1);
  border: 0.5px solid var(--color-border-2);
}
.btn-secondary:hover {
  background: var(--color-overlay);
  border-color: var(--color-border-3);
}

/* Ghost — use for tertiary actions, cancel buttons */
.btn-ghost {
  background: transparent;
  color: var(--color-text-2);
  padding: 8px 10px;
}
.btn-ghost:hover {
  background: var(--color-overlay);
  color: var(--color-text-1);
}

/* Danger — use for destructive actions only */
.btn-danger {
  background: transparent;
  color: var(--color-error-fg);
  border: 0.5px solid var(--color-error-bg);
}
.btn-danger:hover {
  background: var(--color-error-bg);
}

/* Sizes */
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: var(--radius-sm);
}
.btn-lg {
  padding: 11px 22px;
  font-size: 15px;
}
```

---

## Forms & Inputs

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-2);
  letter-spacing: 0.01em;
}

.input,
.select,
.textarea {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-2);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13.5px;
  font-family: var(--font-sans);
  color: var(--color-text-1);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
  outline: none;
  height: 36px;
}
.textarea {
  height: auto;
  min-height: 100px;
  resize: vertical;
}
.input::placeholder {
  color: var(--color-text-3);
}

.input:hover {
  border-color: var(--color-border-3);
}
.input:focus {
  border-color: var(--color-brand-accent);
  box-shadow: 0 0 0 3px var(--color-brand-light);
}
.input.error {
  border-color: #e24b4a;
  box-shadow: 0 0 0 3px rgba(226, 75, 74, 0.1);
}
.input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--color-sunken);
}

.hint {
  font-size: 12px;
  color: var(--color-text-3);
}
.hint.error {
  color: var(--color-error-fg);
}
```

### Select / Dropdown

Use `@radix-ui/react-select` or `@radix-ui/react-dropdown-menu`. Style the content:

```css
.dropdown-content {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: 6px;
  box-shadow:
    0 4px 24px rgba(26, 25, 24, 0.1),
    0 1px 4px rgba(26, 25, 24, 0.06);
  min-width: 180px;
  z-index: 100;
  animation: dropdown-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 13.5px;
  font-family: var(--font-sans);
  color: var(--color-text-1);
  cursor: pointer;
  transition: background 100ms ease;
  user-select: none;
}
.dropdown-item:hover {
  background: var(--color-overlay);
}
.dropdown-item[data-highlighted] {
  background: var(--color-overlay);
}
.dropdown-item.danger {
  color: var(--color-error-fg);
}
.dropdown-item.danger:hover {
  background: var(--color-error-bg);
}
.dropdown-separator {
  height: 0.5px;
  background: var(--color-border-1);
  margin: 4px 0;
}
.dropdown-label {
  padding: 5px 10px 3px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-3);
}

@keyframes dropdown-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

---

## Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  white-space: nowrap;
  font-family: var(--font-sans);
}
.badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.badge-published {
  background: var(--color-published-bg);
  color: var(--color-published-fg);
}
.badge-scheduled {
  background: var(--color-scheduled-bg);
  color: var(--color-scheduled-fg);
}
.badge-pending {
  background: var(--color-pending-bg);
  color: var(--color-pending-fg);
}
.badge-draft {
  background: var(--color-draft-bg);
  color: var(--color-draft-fg);
}
.badge-error {
  background: var(--color-error-bg);
  color: var(--color-error-fg);
}
```

---

## Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  font-family: var(--font-sans);
}
.table thead th {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-3);
  padding: 0 16px 10px;
  text-align: left;
  border-bottom: 0.5px solid var(--color-border-1);
  white-space: nowrap;
  background: transparent;
}
.table tbody td {
  padding: 12px 16px;
  color: var(--color-text-1);
  border-bottom: 0.5px solid var(--color-border-1);
  vertical-align: middle;
}
.table tbody tr:last-child td {
  border-bottom: none;
}
.table tbody tr {
  transition: background 120ms ease;
}
.table tbody tr:hover {
  background: var(--color-overlay);
}
```

---

## Progress Bars

```css
.progress-track {
  width: 100%;
  height: 5px;
  background: var(--color-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-brand-accent);
  transition: width 600ms cubic-bezier(0.16, 1, 0.3, 1);
}
.progress-fill.success {
  background: #1d9e75;
}
.progress-fill.warning {
  background: #ba7517;
}
.progress-fill.error {
  background: #e24b4a;
}
```

---

## Charts (Recharts)

All charts use this shared config. Import and spread into Recharts components.

```typescript
// lib/chart-config.ts
export const CHART_COLORS = {
  primary: '#4A6FA5',
  secondary: '#1D9E75',
  tertiary: '#BA7517',
  grid: '#EAE8E3',
  label: '#9C9890',
}

export const CHART_AXIS_PROPS = {
  tick: {
    fontSize: 11,
    fill: '#9C9890',
    fontFamily: 'var(--font-sans)',
  },
  axisLine: false,
  tickLine: false,
}

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#FFFFFF',
    border: '0.5px solid #EAE8E3',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(26,25,24,0.08)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    padding: '8px 12px',
  },
  labelStyle: {
    color: '#1A1918',
    fontWeight: 500,
    marginBottom: 4,
  },
  itemStyle: {
    color: '#6B6862',
    fontSize: 12,
  },
}

export const LINE_PROPS = {
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4, strokeWidth: 0 },
}
```

**Line / Area charts:**

- `strokeWidth: 2`, no dots, active dot radius 4
- Area fill: `fillOpacity: 0.08` — subtle, not heavy
- Grid lines: `stroke="#EAE8E3"` `strokeDasharray="0"` (solid, not dashed)

**Bar charts:**

- `radius={[4, 4, 0, 0]}` — rounded tops only
- `barCategoryGap="35%"` — generous gap between groups
- Single colour per bar group

---

## Avatars

```css
.avatar {
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  font-family: var(--font-sans);
  flex-shrink: 0;
  user-select: none;
}

/* Sizes */
.avatar-lg {
  width: 44px;
  height: 44px;
  font-size: 14px;
}
.avatar-md {
  width: 32px;
  height: 32px;
  font-size: 12px;
}
.avatar-sm {
  width: 24px;
  height: 24px;
  font-size: 10px;
}

/* Colour variants — assign by hashing the client/user name */
.avatar-blue {
  background: #e6f1fb;
  color: #0c447c;
}
.avatar-green {
  background: #eaf3de;
  color: #27500a;
}
.avatar-purple {
  background: #eeedfe;
  color: #3c3489;
}
.avatar-amber {
  background: #faeeda;
  color: #633806;
}
.avatar-brand {
  background: #2c3e50;
  color: #ffffff;
}
```

---

## Animations

### Timing reference

| Name   | Duration | Curve                        | Use                                |
| ------ | -------- | ---------------------------- | ---------------------------------- |
| Fast   | 120ms    | ease                         | Hover colour/bg transitions        |
| Base   | 200ms    | spring                       | Dropdowns, modals, cards entering  |
| Slow   | 350ms    | spring                       | Page transitions, skeleton reveals |
| Spring | —        | `cubic-bezier(0.16,1,0.3,1)` | All entrances                      |
| Smooth | —        | `cubic-bezier(0.4,0,0.2,1)`  | Exits, fades                       |

### CSS keyframes

```css
/* Page / section entrance */
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Dropdown / tooltip entrance */
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Toast notification */
@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Modal overlay */
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Skeleton shimmer */
@keyframes shimmer {
  from {
    background-position: -200% 0;
  }
  to {
    background-position: 200% 0;
  }
}

/* Stagger children — apply to list containers */
.stagger > *:nth-child(1) {
  animation-delay: 0ms;
}
.stagger > *:nth-child(2) {
  animation-delay: 40ms;
}
.stagger > *:nth-child(3) {
  animation-delay: 80ms;
}
.stagger > *:nth-child(4) {
  animation-delay: 120ms;
}
.stagger > *:nth-child(5) {
  animation-delay: 160ms;
}
```

### Skeleton loading

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-sunken) 25%,
    var(--color-border-1) 50%,
    var(--color-sunken) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
```

### Framer Motion patterns

```typescript
// Page wrapper — wrap every page's root element
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}
export const pageTransition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
}

// Staggered list container + item
export const listContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
}
export const listItem = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
}

// Modal
export const modalOverlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}
export const modalContent = {
  initial: { opacity: 0, scale: 0.96, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 6 },
}
```

---

## Modal / Dialog

Use `@radix-ui/react-dialog`.

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26, 25, 24, 0.45);
  z-index: 200;
}
.modal-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  padding: 28px 32px;
  width: 90vw;
  max-width: 520px;
  border: 0.5px solid var(--color-border-1);
  z-index: 201;
}
.modal-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 400;
  color: var(--color-text-1);
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}
.modal-description {
  font-size: 13.5px;
  color: var(--color-text-2);
  margin-bottom: 24px;
  line-height: 1.6;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 0.5px solid var(--color-border-1);
}
```

---

## Toast Notifications

Use `sonner` library (`npm install sonner`).

```typescript
// app/layout.tsx — add Toaster
import { Toaster } from 'sonner'
<Toaster
  position="bottom-right"
  toastOptions={{
    style: {
      background: '#FFFFFF',
      border: '0.5px solid #EAE8E3',
      borderRadius: '10px',
      color: '#1A1918',
      fontSize: '13.5px',
      fontFamily: 'var(--font-sans)',
      boxShadow: '0 4px 24px rgba(26,25,24,0.10)',
      padding: '12px 16px',
    },
  }}
/>

// Usage
import { toast } from 'sonner'
toast.success('Post approved')
toast.error('Failed to publish')
toast('Scheduled for Thursday 10 Apr')
```

---

## Empty States

Every list, table, and data section needs an empty state.

```tsx
<div className="empty-state">
  <div className="empty-icon">{/* Lucide icon, 32px, color-border-2 */}</div>
  <p className="empty-title">No posts yet</p>
  <p className="empty-desc">Generate your first post to get started.</p>
  <button className="btn btn-primary btn-sm">Generate posts</button>
</div>
```

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 8px;
}
.empty-icon {
  color: var(--color-border-2);
  margin-bottom: 4px;
}
.empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-1);
}
.empty-desc {
  font-size: 13.5px;
  color: var(--color-text-3);
  margin-bottom: 8px;
}
```

---

## Loading States

**Skeleton** — for initial page loads, before data is available:

```tsx
<div className="skeleton" style={{ height: 32, width: '60%' }} />
<div className="skeleton" style={{ height: 16, width: '40%', marginTop: 8 }} />
```

**Spinner** — for actions in progress (button loading, form submitting):

```tsx
// Inline in button
<button className="btn btn-primary" disabled={loading}>
  {loading && <Loader2 className="animate-spin" size={14} />}
  {loading ? 'Generating...' : 'Generate posts'}
</button>
```

Use `animate-spin` from Tailwind for the spinner. Never show a full-page spinner — always use skeleton or inline loading.

---

## Icons

Use **Lucide React** exclusively.

```typescript
import { BarChart2, Calendar, Users, Layers } from 'lucide-react'

// Default size: 16px for inline/nav, 20px for feature icons, 32px for empty states
<BarChart2 size={16} />

// Stroke width: always 1.5 (Lucide default) — never 2 or bold
```

Do not mix icon libraries. Do not use emoji as icons.

---

## Border Rules

- **All card borders:** `0.5px solid var(--color-border-1)` — never `1px`
- **Input borders:** `1px solid var(--color-border-2)` — 1px for inputs only
- **Focus ring:** `box-shadow: 0 0 0 3px var(--color-brand-light)`
- **Dividers:** `0.5px solid var(--color-border-1)` — horizontal rules inside cards
- **No box-shadow on cards** — use border only. Shadow only on dropdowns and modals.

---

## Do / Don't

| ✓ Do                            | ✗ Don't                           |
| ------------------------------- | --------------------------------- |
| `background: #F9F7F4` for page  | `bg-gray-50`, `bg-white` for page |
| `border: 0.5px solid #EAE8E3`   | `border border-gray-200`          |
| `border-radius: 12px` for cards | `rounded-md` (8px) for cards      |
| `font-weight: 400` or `500`     | `font-weight: 600` or `700`       |
| Geist for all UI text           | Inter, System UI defaults         |
| Playfair for page titles only   | Playfair for body/labels/buttons  |
| `#2C3E50` for primary button    | `bg-blue-500`, `bg-blue-600`      |
| `#4A6FA5` for links/accents     | `text-blue-500`                   |
| Muted status colours            | Saturated `green-500`, `red-500`  |
| `cubic-bezier(0.16,1,0.3,1)`    | `linear`, `ease-in`, `ease-out`   |
| Radix UI + custom CSS           | shadcn default styles             |
| `0.5px` card borders            | `1px` card borders                |
| Subtle hover states             | Colour changes on hover           |

---

## Landing Page

### Sections

1. **Nav** — sticky, transparent → frosted on scroll
2. **Hero** — Playfair headline, short subheading, 2 CTAs, dashboard screenshot
3. **Social proof bar** — "trusted by agencies across Europe" + logos
4. **Features** — 3-column grid, icon + title + description
5. **How it works** — 3 numbered steps with connecting line
6. **Analytics preview** — screenshot or mockup with caption
7. **Pricing** — 2 cards (Starter / Pro)
8. **CTA section** — final push, email signup
9. **Footer** — 4-column, dark background `#2C3E50`

### Hero typography

```css
.hero-headline {
  font-family: var(--font-display);
  font-size: clamp(40px, 5vw, 64px);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--color-text-1);
  max-width: 700px;
}
.hero-subheading {
  font-size: 18px;
  font-weight: 400;
  color: var(--color-text-2);
  line-height: 1.65;
  max-width: 480px;
  margin-top: 20px;
}
```

### Landing nav

```css
.landing-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 16px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition:
    background 200ms ease,
    border-color 200ms ease;
}
.landing-nav.scrolled {
  background: rgba(249, 247, 244, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 0.5px solid var(--color-border-1);
}
```

### Pricing cards

- Starter: standard card, `border: 0.5px solid var(--color-border-1)`
- Pro: accent border, `border: 1.5px solid var(--color-brand-accent)`
- No filled background difference — same white surface, border is the differentiator
- Pro badge: `background: var(--color-scheduled-bg); color: var(--color-scheduled-fg)`

---

## Accessibility

- All interactive elements must have visible focus styles
- Focus ring: `box-shadow: 0 0 0 3px var(--color-brand-light)`
- Minimum touch target: 36px × 36px
- Colour contrast: all text must meet WCAG AA (4.5:1 for normal text, 3:1 for large)
- Never remove `outline` without replacing with `box-shadow` focus ring
- All images need `alt` text
- All icon-only buttons need `aria-label`

---

## File Structure

```
styles/
  globals.css          ← CSS variables, base styles, keyframes
  components.css       ← Card, button, badge, table, form styles
  sidebar.css          ← Sidebar and nav styles
  landing.css          ← Landing page only styles

lib/
  chart-config.ts      ← Shared Recharts config

components/
  ui/
    Button.tsx
    Badge.tsx
    Card.tsx
    Input.tsx
    Select.tsx         ← Radix Select + custom styles
    Dropdown.tsx       ← Radix DropdownMenu + custom styles
    Modal.tsx          ← Radix Dialog + custom styles
    Avatar.tsx
    Skeleton.tsx
    Progress.tsx
    Toast.tsx          ← sonner wrapper
  layout/
    Sidebar.tsx
    PageHeader.tsx
    EmptyState.tsx
```

---

_Kontuur Style Guide — v1.0_
_Last updated: April 2026_
_Every decision in this document is intentional. When in doubt, check here first._
