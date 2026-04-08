# Kontuur — Landing Page Plan

> **For Claude Code:** Build each section as a separate component.
> Follow STYLE_GUIDE.md for all colours, typography, and spacing.
> Inspired by later.com — warm, clean, generous whitespace, editorial feel.

---

## Tech

- **Framework:** Next.js 14 App Router
- **Styling:** Tailwind + CSS variables from STYLE_GUIDE.md
- **Animation:** Framer Motion
- **Font:** Geist Sans + Playfair Display (already installed)
- **Icons:** Lucide React

---

## File Structure

```
app/
  (marketing)/
    page.tsx                ← landing page root
    layout.tsx              ← marketing layout (no sidebar)
    login/
      page.tsx              ← redirects to /dashboard

components/
  marketing/
    Nav.tsx
    Hero.tsx
    SocialProof.tsx
    Features.tsx
    HowItWorks.tsx
    DashboardPreview.tsx
    Pricing.tsx
    CtaSection.tsx
    Footer.tsx
```

---

## Section Map

```
┌─────────────────────────────────────────────────────────┐
│  Nav                                                    │
├─────────────────────────────────────────────────────────┤
│  Hero                                                   │
│  "AI-powered social media for serious agencies."        │
│  Subheading + 2 CTAs + dashboard screenshot             │
├─────────────────────────────────────────────────────────┤
│  Social proof bar                                       │
│  "Used by agencies across Bulgaria and Europe"          │
├─────────────────────────────────────────────────────────┤
│  Features — 3 columns                                   │
│  AI generation · Review & approve · Analytics           │
├─────────────────────────────────────────────────────────┤
│  How it works — 3 steps                                 │
│  Connect → Generate → Publish                           │
├─────────────────────────────────────────────────────────┤
│  Dashboard preview — full-width screenshot/mockup       │
├─────────────────────────────────────────────────────────┤
│  Features deep-dive — alternating left/right            │
│  4 features with screenshot + copy                      │
├─────────────────────────────────────────────────────────┤
│  Pricing — 2 cards                                      │
├─────────────────────────────────────────────────────────┤
│  CTA section — final push                               │
├─────────────────────────────────────────────────────────┤
│  Footer                                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Section 1 — Nav

**Layout:** Logo left · Nav links centre · Login button right

**Behaviour:**
- Transparent background on page load
- On scroll > 40px: frosted glass effect kicks in
- Login button → `/dashboard` (protected route, redirects to login if not authenticated)

**Links:** Features · How it works · Pricing · Login

```tsx
// Nav.tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
      <KontuurLogo />
      <div className="nav-links">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Pricing</a>
      </div>
      <Link href="/dashboard" className="btn btn-primary btn-sm">
        Log in
      </Link>
    </nav>
  )
}
```

```css
.landing-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 0 40px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 200ms ease, border-color 200ms ease;
}
.landing-nav.scrolled {
  background: rgba(249,247,244,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 0.5px solid var(--color-border-1);
}
.nav-links {
  display: flex;
  gap: 32px;
}
.nav-links a {
  font-size: 14px;
  color: var(--color-text-2);
  text-decoration: none;
  transition: color 120ms ease;
}
.nav-links a:hover { color: var(--color-text-1); }
```

---

## Section 2 — Hero

**Goal:** Make the agency owner immediately understand the value and click "Get started".

**Layout:** Centred, full-width

**Content:**
```
EYEBROW:   Built for marketing agencies

HEADLINE:  AI-powered social media
           for serious agencies.

SUB:       Generate, review, schedule and analyse Instagram content
           for all your clients — from one place.

BUTTONS:   [Get started free →]   [See how it works]

VISUAL:    Dashboard screenshot (or animated mockup)
           — floated below with subtle top shadow
           — slight upward entrance animation on load
```

**Typography:**
- Eyebrow: 11px, uppercase, letter-spacing 0.1em, `var(--color-brand-accent)`
- Headline: Playfair Display, `clamp(40px, 5vw, 64px)`, weight 400, `-0.03em`
- Sub: Geist, 18px, `var(--color-text-2)`, max-width 480px

**Animations:**
- Eyebrow: `fade-up` 0ms delay
- Headline: `fade-up` 60ms delay
- Sub: `fade-up` 120ms delay
- Buttons: `fade-up` 180ms delay
- Dashboard image: `fade-up` 300ms delay, scale from 0.97 to 1

**CTA buttons:**
- Primary: `btn btn-primary btn-lg` → `/dashboard`
- Secondary: `btn btn-secondary btn-lg` → scroll to `#how-it-works`

---

## Section 3 — Social Proof Bar

**Goal:** Establish credibility immediately after the hero.

**Layout:** Full-width, thin horizontal band

**Content:**
```
"Trusted by agencies in Bulgaria and across Europe"
[Agency logo] [Agency logo] [Agency logo] [Agency logo] [Agency logo]
```

Initially use placeholder names until real agency logos are available:
```
About Social Media  ·  Agency 2  ·  Agency 3  ·  Agency 4
```

**Style:**
- Background: `var(--color-sunken)` `#F2F0EC`
- Border top + bottom: `0.5px solid var(--color-border-1)`
- Padding: `20px 40px`
- Text: 12px, `var(--color-text-3)`, centered
- Logos/names: `var(--color-text-3)`, greyscale, `opacity: 0.6`

---

## Section 4 — Features (3 columns)

**Goal:** Quickly show the three core pillars of the platform.

**Headline:** `Everything your agency needs`

**3 feature cards:**

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  [Icon 32px]    │  │  [Icon 32px]    │  │  [Icon 32px]    │
│                 │  │                 │  │                 │
│  AI content     │  │  Review &       │  │  Real           │
│  generation     │  │  approve        │  │  analytics      │
│                 │  │                 │  │                 │
│  Generate posts │  │  Multi-client   │  │  Direct from    │
│  from your      │  │  approval flow. │  │  Instagram API  │
│  client's       │  │  One click to   │  │  — reach,       │
│  website and    │  │  publish.       │  │  saves,         │
│  documents.     │  │                 │  │  engagement.    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Icons:**
- AI generation: `Sparkles` (Lucide)
- Review & approve: `CheckSquare` (Lucide)
- Analytics: `BarChart2` (Lucide)

**Card style:**
- Background: `var(--color-sunken)` — NOT white, so they read as a different zone
- No border
- Border radius: `var(--radius-xl)` — 16px
- Padding: `28px 28px`
- Icon colour: `var(--color-brand-accent)` `#4A6FA5`
- Hover: `transform: translateY(-2px)` + `background: #EEECEA`
- Transition: 200ms spring

---

## Section 5 — How It Works

**Goal:** Remove friction — show it's simple to get started.

**Headline:** `Up and running in minutes`

**3 steps with connecting line:**

```
    ①                    ②                    ③
Connect your         Generate AI          Publish directly
client Instagram     posts in seconds     to Instagram
account.             from their website.  with one click.

  [Screenshot]         [Screenshot]         [Screenshot]
```

**Style:**
- Step number: 36×36px circle, `var(--color-brand)` background, white number
- Title: 15px, weight 500
- Description: 13.5px, `var(--color-text-2)`
- Connecting line between circles: `1px dashed var(--color-border-2)`
- Small screenshot/illustration below each step (can be a simplified mockup)
- Entrance: stagger animation, each step `60ms` apart

---

## Section 6 — Dashboard Preview

**Goal:** Show the product. Let it sell itself.

**Layout:** Full-width, edge-to-edge with clipped overflow

**Content:**
- Section label: "The dashboard"
- Short headline: `Everything in one place`
- Short subtext: 1 sentence
- Full-width dashboard screenshot below — slightly cropped at bottom
- Screenshot has top-rounded corners: `border-radius: 16px 16px 0 0`
- Subtle inner shadow at the bottom edge to indicate continuation

**Background:** `var(--color-brand)` dark slate — makes the screenshot pop

```css
.dashboard-preview-section {
  background: var(--color-brand);
  padding: 80px 40px 0;
  overflow: hidden;
}
.dashboard-preview-section .section-label { color: rgba(255,255,255,0.4); }
.dashboard-preview-section h2 { color: rgba(255,255,255,0.95); }
.dashboard-preview-section p  { color: rgba(255,255,255,0.55); }
.dashboard-screenshot {
  border-radius: 16px 16px 0 0;
  border: 0.5px solid rgba(255,255,255,0.12);
  width: 100%;
  margin-top: 48px;
}
```

---

## Section 7 — Features Deep-Dive (Alternating)

**Goal:** Explain 4 key features with more detail and a visual for each.

**Layout:** Alternating left text / right image, then right text / left image

**4 features:**

```
Feature 1 — AI generation
Left: copy         Right: screenshot of generate posts page
──────────────────────────────────────────────────────────
Icon: Sparkles
Title: Generate posts from real content
Body:  Kontuur reads your client's website, documents, and
       previous posts to generate on-brand Instagram content
       in Bulgarian or English. Single images, carousels, and
       Reels scripts — all with one click.
Tag:   AI · Content generation

Feature 2 — Review queue
Right: copy        Left: screenshot of review queue
──────────────────────────────────────────────────────────
Icon: CheckSquare
Title: Approve, edit, schedule in seconds
Body:  Every generated post goes into a review queue. Read the
       caption, check the source grounding, approve or reject.
       Schedule directly to Instagram from the same screen.
Tag:   Review · Approval workflow

Feature 3 — Instagram publishing
Left: copy         Right: screenshot of calendar
──────────────────────────────────────────────────────────
Icon: Send
Title: Publish directly to Instagram
Body:  Connect your clients' Instagram accounts once. Kontuur
       handles publishing — single images, carousels, and
       scheduled posts — using the official Meta API.
Tag:   Publishing · Scheduling

Feature 4 — Analytics
Right: copy        Left: screenshot of analytics page
──────────────────────────────────────────────────────────
Icon: BarChart2
Title: Real data, not estimates
Body:  Analytics pulled directly from the Instagram API —
       reach, saves, engagement rate, follower growth, and
       post-level performance for every client account.
Tag:   Analytics · Instagram insights
```

**Style:**
- Section padding: `80px 40px`
- Between features: `80px` gap
- Copy column: max-width `440px`
- Image column: screenshot in a card with `border-radius: 12px` and `border: 0.5px solid var(--color-border-1)`
- Tag: small badge, `var(--color-scheduled-bg)` / `var(--color-scheduled-fg)`
- Entrance: each feature animates in when scrolled into view (`whileInView` Framer Motion)

---

## Section 8 — Pricing

**Goal:** Clear, simple, no surprises.

**Headline:** `Simple pricing for agencies`

**2 cards:**

```
┌──────────────────────┐  ┌──────────────────────┐
│  Starter             │  │  Pro          [Most   │
│                      │  │               popular]│
│  €49                 │  │  €99                  │
│  per month           │  │  per month            │
│                      │  │                       │
│  ✓ Up to 3 clients   │  │  ✓ Unlimited clients  │
│  ✓ AI generation     │  │  ✓ Everything in      │
│  ✓ Review queue      │  │    Starter            │
│  ✓ Instagram publish │  │  ✓ Advanced analytics │
│  ✓ Basic analytics   │  │  ✓ Priority support   │
│                      │  │  ✓ White-label reports│
│  [Start free trial]  │  │  [Start free trial]   │
└──────────────────────┘  └──────────────────────┘

         14-day free trial · No credit card required
```

**Card styles:**
- Starter: standard card, `border: 0.5px solid var(--color-border-1)`
- Pro: `border: 1.5px solid var(--color-brand-accent)`, "Most popular" badge
- Both: white surface, `border-radius: var(--radius-xl)`, padding `32px`
- Price: Playfair 40px weight 400
- Per month: 14px `var(--color-text-3)`
- Feature list: 13.5px, checkmark in `var(--color-published-fg)` green
- CTA button: `btn-primary` on both

---

## Section 9 — CTA Section

**Goal:** Last push before the footer. Catch anyone who scrolled this far.

**Layout:** Centred, generous padding

**Content:**
```
Headline:    Start managing your clients' Instagram today.

Sub:         Join agencies using Kontuur to save time,
             deliver better results, and grow their business.

Button:      [Get started free →]
             No credit card required · 14-day free trial

Visual:      Optional — the Kontuur logo mark (large, muted)
             as a decorative background element
```

**Style:**
- Background: `var(--color-sunken)` `#F2F0EC`
- Headline: Playfair, 36px, weight 400
- Padding: `96px 40px`
- Max-width centred: `640px`

---

## Section 10 — Footer

**Layout:** 4-column grid

**Columns:**
```
Kontuur              Product              Company         Legal
[Logo mark]          Features             About           Privacy policy
social intelligence  Pricing              Blog            Terms of service
                     Changelog            Contact         Cookie policy
                     Roadmap
```

**Style:**
- Background: `var(--color-brand)` `#2C3E50`
- Text: `rgba(255,255,255,0.55)`
- Hover: `rgba(255,255,255,0.85)`
- Column title: `rgba(255,255,255,0.25)`, 10px, uppercase, `+0.1em`
- Border top: `0.5px solid rgba(255,255,255,0.08)`
- Bottom row: copyright + "Built by About Social Media"
- Padding: `64px 40px 40px`

---

## SEO & Meta

```tsx
// app/(marketing)/page.tsx
export const metadata = {
  title: 'Kontuur — AI-powered social media for agencies',
  description: 'Generate, review, schedule and analyse Instagram content for all your clients from one place. Built for marketing agencies.',
  openGraph: {
    title: 'Kontuur',
    description: 'AI-powered social media management for agencies.',
    image: '/og-image.png',   // 1200×630px
    url: 'https://kontuur.app',
  },
}
```

---

## Animations — Scroll-triggered (Framer Motion)

Every section animates in as it enters the viewport:

```typescript
// components/marketing/AnimateIn.tsx
'use client'
import { motion } from 'framer-motion'

export function AnimateIn({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  )
}
```

Use `once: true` — elements animate in once, never re-animate on scroll back up.

---

## Responsive breakpoints

| Breakpoint | Layout change |
|---|---|
| `< 768px` | Single column everything, nav collapses to hamburger |
| `768px–1024px` | Feature cards 2-col, alternating features stack |
| `> 1024px` | Full layout as designed |

---

## Build order

```
Step 1  → Nav (sticky, scroll behaviour, login button)
Step 2  → Hero (headline, subheading, CTAs, placeholder for screenshot)
Step 3  → Social proof bar
Step 4  → Features 3-column
Step 5  → How it works 3-step
Step 6  → Pricing cards
Step 7  → CTA section
Step 8  → Footer
Step 9  → Add AnimateIn scroll animations to all sections
Step 10 → Dashboard preview section (needs real screenshot)
Step 11 → Features deep-dive alternating (needs real screenshots)
Step 12 → Mobile responsive pass
Step 13 → SEO metadata
Step 14 → OG image
```

Steps 10 and 11 require real screenshots from the built app. Build them last.

---

## Login button behaviour

The nav "Log in" button and all "Get started" CTAs point to `/dashboard`.

Middleware handles auth redirect:
```typescript
// middleware.ts (already exists for i18n)
// Add: if not authenticated and hitting /dashboard → redirect to /login
// If authenticated and hitting / → can optionally redirect to /dashboard
```

The login page at `/login` uses your existing Supabase auth flow.

---

*Kontuur Landing Page Plan — v1.0*
*Later.com warmth · generous whitespace · editorial typography · calm confidence*