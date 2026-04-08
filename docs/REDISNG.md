# Kontuur — Design System Plan

> Reference document for Claude Code and designers.
> Covers the full design language: tokens, typography, components, animations,
> landing page, and app UI. Inspired by Later.com's warmth and Linear's precision.

---

## 1. Design Philosophy

**Warm precision.** The UI should feel like a well-designed editorial tool — warm
enough to be approachable for agency owners, precise enough to feel professional
for daily use. Later's warmth, Linear's density, Vercel's typography.

Three guiding principles:
- **Content first** — the posts, data, and clients are the thing. The UI recedes.
- **Calm confidence** — no aggressive CTAs, no anxiety-inducing red states.
  Status colours are muted, not alarming.
- **Considered motion** — animations confirm actions and guide attention.
  Nothing moves for decoration.

---

## 2. Colour Tokens

### Base palette

```css
:root {
  /* Page backgrounds */
  --color-page:       #F9F7F4;   /* warm off-white — main page bg */
  --color-surface:    #FFFFFF;   /* card surfaces */
  --color-sunken:     #F2F0EC;   /* inset sections, code blocks */
  --color-overlay:    rgba(26,25,24,0.04);  /* hover states on white */

  /* Brand */
  --color-brand:      #2C3E50;   /* Kontuur slate — sidebar, primary buttons */
  --color-brand-mid:  #3D5166;   /* hover state on brand */
  --color-brand-muted:#4A6FA5;   /* links, accents, mark blocks */

  /* Text */
  --color-text-1:     #1A1918;   /* primary — headings, values */
  --color-text-2:     #6B6862;   /* secondary — descriptions, labels */
  --color-text-3:     #9C9890;   /* tertiary — hints, timestamps, placeholders */
  --color-text-inv:   #FFFFFF;   /* text on dark backgrounds */

  /* Borders */
  --color-border-1:   #EAE8E3;   /* default — card edges, dividers */
  --color-border-2:   #D4D1CA;   /* emphasis — input borders, focused */
  --color-border-3:   #B8B5AE;   /* strong — active inputs */

  /* Status — intentionally muted, never alarming */
  --color-published-bg:  #EAF3DE;  --color-published-text: #27500A;
  --color-scheduled-bg:  #EEF2FF;  --color-scheduled-text: #3C3489;
  --color-pending-bg:    #FAEEDA;  --color-pending-text:   #633806;
  --color-draft-bg:      #F2F0EC;  --color-draft-text:     #6B6862;
  --color-error-bg:      #FCEBEB;  --color-error-text:     #791F1F;

  /* Charts */
  --color-chart-1:    #4A6FA5;   /* primary data series — brand blue */
  --color-chart-2:    #1D9E75;   /* secondary — teal */
  --color-chart-3:    #BA7517;   /* tertiary — amber */
  --color-chart-grid: #EAE8E3;   /* grid lines */
  --color-chart-label:#9C9890;   /* axis labels */
}
```

### Sidebar (always dark)

```css
.sidebar {
  --sidebar-bg:       #2C3E50;
  --sidebar-item:     rgba(255,255,255,0.55);
  --sidebar-item-hover: rgba(255,255,255,0.85);
  --sidebar-item-active: rgba(255,255,255,1);
  --sidebar-item-bg-hover: rgba(255,255,255,0.07);
  --sidebar-item-bg-active: rgba(255,255,255,0.12);
  --sidebar-border:   rgba(255,255,255,0.08);
  --sidebar-badge-bg: rgba(255,255,255,0.15);
  --sidebar-badge-text: rgba(255,255,255,0.8);
}
```

### Dark mode override (future)

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-page:    #141312;
    --color-surface: #1C1B19;
    --color-sunken:  #111010;
    --color-text-1:  #F0EDE8;
    --color-text-2:  #8A8880;
    --color-text-3:  #5A5854;
    --color-border-1:#2A2927;
    --color-border-2:#3A3835;
  }
}
```

---

## 3. Typography

### Font stack

```typescript
// app/layout.tsx
import { Geist } from 'next/font/google'
import { Playfair_Display } from 'next/font/google'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
})

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-display',
  weight: ['400', '500'],
})
```

```css
body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-1);
  background: var(--color-page);
  -webkit-font-smoothing: antialiased;
}
```

### Scale

```css
:root {
  --text-2xs:    10px;   /* column labels — uppercase, tracked */
  --text-xs:     11px;   /* timestamps, badge text */
  --text-sm:     12px;   /* secondary descriptions, captions */
  --text-base:   13.5px; /* body, nav items, table cells */
  --text-md:     15px;   /* card titles, section headings */
  --text-lg:     18px;   /* subsection headings */
  --text-xl:     22px;   /* small stat numbers */
  --text-2xl:    32px;   /* large stat numbers */
  --text-display:28px;   /* page titles — Playfair */
  --text-hero:   52px;   /* landing page hero — Playfair */
}
```

### Usage rules

| Element | Size | Weight | Font | Letter spacing |
|---|---|---|---|---|
| Page title | 28px | 400 | Playfair | -0.02em |
| Stat number (large) | 32px | 400 | Geist | -0.02em |
| Card title | 15px | 500 | Geist | 0 |
| Nav items | 13.5px | 400 | Geist | 0 |
| Table cell | 13.5px | 400 | Geist | 0 |
| Table header | 11px | 500 | Geist | +0.06em (uppercase) |
| Badge | 11px | 500 | Geist | +0.02em |
| Timestamp | 12px | 400 | Geist | 0 |
| Hint / placeholder | 12px | 400 | Geist | 0 |
| Hero (landing) | 52–64px | 400 | Playfair | -0.03em |

---

## 4. Spacing & Layout

```css
:root {
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;

  --radius-sm: 6px;    /* badges, small elements */
  --radius-md: 8px;    /* buttons, inputs */
  --radius-lg: 12px;   /* cards */
  --radius-xl: 16px;   /* large cards, modals */
  --radius-full: 9999px; /* pills, avatars */

  --sidebar-width: 224px;
  --page-padding:  40px;
  --card-padding:  20px 24px;
  --content-max:   1280px;
}
```

---

## 5. Cards

### Base card

```css
.card {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: var(--card-padding);
}
```

### Metric card (stat numbers)

```css
.metric-card {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.metric-card:hover {
  border-color: var(--color-border-2);
  transform: translateY(-1px);
}
.metric-label {
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-3);
  margin-bottom: 10px;
}
.metric-value {
  font-size: var(--text-2xl);
  font-weight: 400;
  color: var(--color-text-1);
  line-height: 1;
  letter-spacing: -0.02em;
}
.metric-delta {
  font-size: var(--text-sm);
  margin-top: 6px;
  color: var(--color-text-3);
}
.metric-delta.up   { color: var(--color-published-text); }
.metric-delta.down { color: var(--color-error-text); }
```

### Post card (review queue)

```css
.post-card {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}
.post-card:hover {
  border-color: var(--color-border-2);
  box-shadow: 0 2px 12px rgba(26,25,24,0.06);
}
.post-card.selected {
  border-color: var(--color-brand-muted);
  box-shadow: 0 0 0 3px rgba(74,111,165,0.12);
}
```

---

## 6. Buttons

```css
/* Primary — brand slate */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  white-space: nowrap;
}
.btn-primary {
  background: var(--color-brand);
  color: var(--color-text-inv);
}
.btn-primary:hover  { background: var(--color-brand-mid); }
.btn-primary:active { transform: scale(0.98); }

/* Secondary — outlined */
.btn-secondary {
  background: transparent;
  color: var(--color-text-1);
  border: 0.5px solid var(--color-border-2);
}
.btn-secondary:hover {
  background: var(--color-overlay);
  border-color: var(--color-border-3);
}

/* Ghost — no border */
.btn-ghost {
  background: transparent;
  color: var(--color-text-2);
  border: none;
  padding: 8px 10px;
}
.btn-ghost:hover { background: var(--color-overlay); color: var(--color-text-1); }

/* Destructive */
.btn-danger {
  background: transparent;
  color: var(--color-error-text);
  border: 0.5px solid var(--color-error-bg);
}
.btn-danger:hover { background: var(--color-error-bg); }

/* Size variants */
.btn-sm { padding: 5px 12px; font-size: var(--text-sm); border-radius: var(--radius-sm); }
.btn-lg { padding: 11px 22px; font-size: var(--text-md); }
```

---

## 7. Forms & Inputs

```css
.field { display: flex; flex-direction: column; gap: 6px; }

.label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-2);
  letter-spacing: 0.01em;
}

.input, .select, .textarea {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-2);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: var(--text-base);
  color: var(--color-text-1);
  font-family: var(--font-sans);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}
.input::placeholder  { color: var(--color-text-3); }
.input:hover         { border-color: var(--color-border-3); }
.input:focus {
  border-color: var(--color-brand-muted);
  box-shadow: 0 0 0 3px rgba(74,111,165,0.12);
}
.input.error {
  border-color: #E24B4A;
  box-shadow: 0 0 0 3px rgba(226,75,74,0.1);
}

.textarea { min-height: 100px; resize: vertical; line-height: 1.6; }

.hint {
  font-size: var(--text-sm);
  color: var(--color-text-3);
}
.hint.error { color: var(--color-error-text); }
```

### Dropdown / Select (custom)

Use Radix UI `Select` or `@radix-ui/react-dropdown-menu` for accessible dropdowns.

```css
.dropdown-content {
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-1);
  border-radius: var(--radius-lg);
  padding: 6px;
  box-shadow: 0 4px 24px rgba(26,25,24,0.10), 0 1px 4px rgba(26,25,24,0.06);
  min-width: 180px;
  animation: dropdown-in 0.15s cubic-bezier(0.16,1,0.3,1);
}
.dropdown-item {
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  color: var(--color-text-1);
  cursor: pointer;
  transition: background 0.1s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dropdown-item:hover  { background: var(--color-overlay); }
.dropdown-item.danger { color: var(--color-error-text); }
.dropdown-item.danger:hover { background: var(--color-error-bg); }

.dropdown-separator {
  height: 0.5px;
  background: var(--color-border-1);
  margin: 4px 0;
}

@keyframes dropdown-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

---

## 8. Badges & Status Pills

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.badge-published { background: var(--color-published-bg); color: var(--color-published-text); }
.badge-scheduled { background: var(--color-scheduled-bg); color: var(--color-scheduled-text); }
.badge-pending   { background: var(--color-pending-bg);   color: var(--color-pending-text); }
.badge-draft     { background: var(--color-draft-bg);     color: var(--color-draft-text); }
.badge-error     { background: var(--color-error-bg);     color: var(--color-error-text); }
```

---

## 9. Charts

All charts use Recharts. Consistent visual language:

```typescript
// shared chart config
export const CHART_CONFIG = {
  colors: {
    primary:   '#4A6FA5',
    secondary: '#1D9E75',
    tertiary:  '#BA7517',
    grid:      '#EAE8E3',
    label:     '#9C9890',
  },
  axis: {
    tick: { fontSize: 11, fill: '#9C9890', fontFamily: 'var(--font-sans)' },
    axisLine: false,
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      background: '#FFFFFF',
      border: '0.5px solid #EAE8E3',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(26,25,24,0.08)',
      fontSize: 13,
      fontFamily: 'var(--font-sans)',
    },
    labelStyle: { color: '#1A1918', fontWeight: 500 },
  },
}

// Line chart stroke style
const lineProps = {
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4, strokeWidth: 0 },
}
```

### Area chart (reach / views over time)

Use `AreaChart` with `fillOpacity: 0.08` — subtle fill, strong line. No heavy fills.

### Bar chart (media type breakdown, posting frequency)

Rounded bars: `radius={[4, 4, 0, 0]}`, gap between bars `barCategoryGap="35%"`.

---

## 10. Progress Bars

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
  background: var(--color-brand-muted);
  transition: width 0.6s cubic-bezier(0.16,1,0.3,1);
}
.progress-fill.success { background: #1D9E75; }
.progress-fill.warning { background: #BA7517; }
```

---

## 11. Animations

All animations use `cubic-bezier(0.16,1,0.3,1)` — the "spring" curve. Snappy entry,
no bounce, no overshoot.

```css
:root {
  --ease-spring: cubic-bezier(0.16,1,0.3,1);
  --ease-smooth: cubic-bezier(0.4,0,0.2,1);
  --duration-fast:   120ms;
  --duration-base:   200ms;
  --duration-slow:   350ms;
}

/* Page entrance */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-in {
  animation: fade-up var(--duration-base) var(--ease-spring) both;
}

/* Stagger children */
.stagger-children > * {
  animation: fade-up var(--duration-base) var(--ease-spring) both;
}
.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 40ms; }
.stagger-children > *:nth-child(3) { animation-delay: 80ms; }
.stagger-children > *:nth-child(4) { animation-delay: 120ms; }

/* Skeleton loading */
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-sunken) 25%,
    var(--color-border-1) 50%,
    var(--color-sunken) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

/* Sidebar item hover */
.nav-item {
  transition: color var(--duration-fast) var(--ease-smooth),
              background var(--duration-fast) var(--ease-smooth);
}

/* Toast / notification entry */
@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
.toast {
  animation: slide-in-right var(--duration-base) var(--ease-spring);
}

/* Modal overlay */
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-overlay { animation: fade-in var(--duration-base) var(--ease-smooth); }
.modal-content { animation: scale-in var(--duration-base) var(--ease-spring); }
```

### Framer Motion usage

For page transitions and interactive components, use Framer Motion:

```typescript
// Page wrapper
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: [0.16,1,0.3,1] }}
>
  {children}
</motion.div>

// Staggered list
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}
const item = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0 }
}
```

---

## 12. Tables

```css
.table { width: 100%; border-collapse: collapse; font-size: var(--text-base); }

.table thead th {
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-3);
  padding: 0 16px 10px;
  text-align: left;
  border-bottom: 0.5px solid var(--color-border-1);
  white-space: nowrap;
}

.table tbody td {
  padding: 12px 16px;
  color: var(--color-text-1);
  border-bottom: 0.5px solid var(--color-border-1);
  vertical-align: middle;
}

.table tbody tr:last-child td { border-bottom: none; }

.table tbody tr {
  transition: background var(--duration-fast) var(--ease-smooth);
}
.table tbody tr:hover { background: var(--color-overlay); }
```

---

## 13. Sidebar

```css
.sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  height: 100vh;
  flex-shrink: 0;
}

/* Logo area */
.sidebar-logo {
  padding: 26px 22px 18px;
  border-bottom: 0.5px solid var(--sidebar-border);
}

/* Section label */
.sidebar-section {
  padding: 20px 22px 6px;
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.25);
}

/* Nav item */
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 22px;
  font-size: var(--text-base);
  color: var(--sidebar-item);
  cursor: pointer;
  border-radius: 0;
  transition: color var(--duration-fast),
              background var(--duration-fast);
  user-select: none;
}
.nav-item:hover {
  color: var(--sidebar-item-hover);
  background: var(--sidebar-item-bg-hover);
}
.nav-item.active {
  color: var(--sidebar-item-active);
  background: var(--sidebar-item-bg-active);
}

/* Badge on nav item */
.nav-badge {
  margin-left: auto;
  background: var(--sidebar-badge-bg);
  color: var(--sidebar-badge-text);
  font-size: var(--text-xs);
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

/* Bottom section */
.sidebar-footer {
  margin-top: auto;
  padding: 16px 22px;
  border-top: 0.5px solid var(--sidebar-border);
}
```

---

## 14. Landing Page

### Structure

```
/
├── Nav
├── Hero section
├── Social proof bar
├── Features section (3 columns)
├── How it works (3 steps)
├── Analytics preview
├── Pricing
├── CTA section
└── Footer
```

### Nav

Transparent on scroll-top, white with blur on scroll. Logo left, nav links centre,
CTA button right.

```css
.landing-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 16px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.landing-nav.scrolled {
  background: rgba(249,247,244,0.92);
  backdrop-filter: blur(12px);
  border-bottom: 0.5px solid var(--color-border-1);
}
```

### Hero section

```
Headline:    AI-powered social media
             for serious agencies.         ← Playfair, 56–64px, 400 weight

Subheading:  Generate, review, schedule, and
             analyse — all from one place.  ← Geist, 18px, text-2 colour

CTA row:     [Start free] [See how it works →]

Visual:      Dashboard screenshot / animated mockup
             floating below, slight shadow
```

Typography:
```css
.hero-headline {
  font-family: var(--font-display);
  font-size: clamp(40px, 5vw, 64px);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--color-text-1);
}
.hero-sub {
  font-size: 18px;
  color: var(--color-text-2);
  line-height: 1.6;
  max-width: 480px;
}
```

### Social proof bar

Thin horizontal strip between hero and features:
```
"Trusted by agencies across Europe"
[Logo] [Logo] [Logo] [Logo] [Logo]
```

Background `var(--color-sunken)`, 0.5px borders top and bottom.

### Features (3 columns)

```
[Icon]               [Icon]               [Icon]
AI generation        Review & approve     Analytics
Generate Bulgarian   Multi-client post    Real Instagram data
posts from your      approval with        — reach, saves,
client's website.    one click.           engagement rate.
```

Cards with no border — background `var(--color-sunken)`, radius-xl, generous padding.
Icon: 32px, brand-muted colour, simple SVG stroke icons.

### How it works (3 steps)

Horizontal numbered steps with connecting line between them:

```
1 ──────────── 2 ──────────── 3
Connect         Generate        Publish
your client     AI posts        directly to
Instagram.      in seconds.     Instagram.
```

Step numbers: 36px circle, brand colour, Geist 400.

### Pricing

Two cards side by side:

```
[Agency Starter]         [Agency Pro]
€49 / month             €99 / month
Up to 3 clients         Unlimited clients
AI generation           Everything in Starter
Review queue            Advanced analytics
Instagram publishing    White-label reports
[Start free trial]      [Start free trial]
```

Pro card accented with `border: 1.5px solid var(--color-brand-muted)`.

### Footer

4-column grid:
```
Kontuur             Product             Company         Legal
[tagline]           Features            About           Privacy policy
                    Pricing             Blog            Terms of service
                    Changelog                           Cookie policy
```

Background `var(--color-brand)`, white text, muted links.

---

## 15. Implementation Order

```
Week 1 — Foundations
  Step 1   → Install Geist + Playfair, update layout.tsx
  Step 2   → Add globals.css with all CSS variables
  Step 3   → Update sidebar — dark background, new nav styles
  Step 4   → Update page background to --color-page (#F9F7F4)
  Step 5   → Update all buttons to new system
  Step 6   → Update all inputs and forms

Week 2 — Components
  Step 7   → Metric cards with hover lift
  Step 8   → Post cards with hover shadow
  Step 9   → Badges with new status colours
  Step 10  → Dropdowns using Radix UI
  Step 11  → Tables with new header style

Week 3 — Motion & Polish
  Step 12  → Install Framer Motion
  Step 13  → Page transition wrapper
  Step 14  → Staggered stat card entrance
  Step 15  → Skeleton loading states
  Step 16  → Toast notification system

Week 4 — Charts & Analytics
  Step 17  → Apply CHART_CONFIG to all Recharts components
  Step 18  → Area chart for reach/views
  Step 19  → Bar chart for media type breakdown
  Step 20  → Progress bars for goal tracking

Week 5 — Landing Page
  Step 21  → Nav with scroll state
  Step 22  → Hero section with Playfair headline
  Step 23  → Features and how-it-works sections
  Step 24  → Pricing cards
  Step 25  → Footer with dark background
```

---

## 16. Component Library Decision

**Use Radix UI primitives + custom CSS** (not shadcn/ui default styles).

Radix provides the accessible behaviour (keyboard navigation, ARIA, focus management)
for: Dialog, DropdownMenu, Select, Tooltip, Popover, Switch, Checkbox, Tabs.

Write your own CSS on top of it using the tokens above. This gives you Kontuur's
visual identity rather than the shadcn aesthetic.

```bash
npm install @radix-ui/react-dialog
npm install @radix-ui/react-dropdown-menu
npm install @radix-ui/react-select
npm install @radix-ui/react-tooltip
npm install @radix-ui/react-popover
npm install @radix-ui/react-switch
npm install framer-motion
```

---

*Kontuur Design System — v1.0*
*Later.com warmth × Linear precision × Playfair editorial identity*