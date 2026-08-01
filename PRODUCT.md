# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences intended to be of **equal priority** — neither leads, and every surface should eventually be checked against both.

> **Current state (2026-07-30):** solo mode is **not yet developed** and is explicitly out of scope for near-term design work. Equal priority remains the intent, not a description of today's build. Do not scope design work to solo surfaces, and do not treat solo defects as blocking — but do not deepen the gap either: new shared surfaces should avoid hard-coding agency-only assumptions that solo would later have to unpick.

- **Agency mode** — marketing agency teams managing social content for multiple client brands. They work across clients, in volume, and answer to the client for what ships. Their situation is throughput plus accountability: many brands, each with its own voice, each needing sign-off.
- **Solo mode** — a single business owner running their own socials. One brand, no client to please, less time and less marketing expertise. Solo auto-creates one client for the business and simplifies navigation and language throughout.

Mode is chosen at signup and stored on the agency (`agencies.mode`). Within an agency, users carry a `role` of `admin` or `member`.

A third party touches the product without ever holding an account: **the end client**, who reviews and approves posts, or submits ideas, through public token links.

## Product Purpose

Kontuur takes a client from onboarding to published post, with AI doing the heavy lifting at every stage: it learns the client's brand, researches on-topic ideas grounded in the client's own sources, writes platform-native posts, validates them for quality and language authenticity, routes them through client approval, schedules them, and auto-publishes to Instagram.

Success is a post that ships without anyone rewriting it — content the agency is willing to put its name to, in a voice the client recognizes as their own.

The whole loop can also run **autonomously**: a daily cron generates a review queue for every client on an active posting schedule, and a second cron publishes everything due.

## Positioning

**Source-grounded generation plus per-language authenticity validation.**

Two mechanisms a generic AI writing tool cannot truthfully claim:

1. **Grounding.** Topics are generated from the client's own research sources (RSS, website, uploaded files, plus Tavily web trends), allocated across content pillars by weight. A topic that does not carry a real source URL is filtered out as an LLM hallucination, and pillars with no eligible sources are skipped rather than invented around.
2. **Language authenticity.** A per-language ruleset (`language_rules`, seeded for Bulgarian and English) encodes banned anglicisms, banned calques, formality rules, and native CTA phrasing. Validation scores naturalness and register as first-class dimensions. The Bulgarian-first language layer is the part generic English-centric AI writers genuinely lack.

Validation is not a disclaimer here — posts are scored on brief, craft, voice, source, and language, and generation keeps only candidates above a quality floor.

## Operating Context

The content lifecycle, in order:

```
Onboard client → configure brand profile + research sources
  → Research (client RSS/website/file sources + Tavily, grounded per content pillar)
  → Generate (single posts / carousels, N candidates per theme)
  → Validate (quality + language in parallel, auto-correction, slop + source checks)
  → Review queue → optional client approval portal (public magic link)
  → Calendar (schedule + best-time recommendations) → attach images (upload / Canva)
  → Auto-publish to Instagram (Meta Graph API) via daily cron
  → Analytics + weekly AI intelligence briefing
```

Surfaces: Dashboard, Clients, Generate (full-screen wizard), Review queue, Calendar, Client ideas, Analytics, Settings — renamed in solo mode (Create content, My drafts, My calendar, My results). Public, login-free surfaces: the approval portal and the idea submission form. Plus a marketing site (landing, pricing, privacy, terms, data deletion).

## Capabilities and Constraints

**Confirmed capabilities:** multi-client management with AI onboarding from a website or Instagram URL; post, carousel, and reel-script generation across Instagram, TikTok, LinkedIn, Twitter, and Pinterest; multi-dimensional quality and language validation with auto-correction and slop detection; review queue with batch operations; token-based client approval (48-hour expiry) and client idea submission; content calendar with best-time recommendations; posting schedules driving autonomous generation; Instagram/Facebook publishing; analytics with PDF export; weekly AI intelligence briefings and solo coaching cards; team invites with admin/member roles; AI-composed visuals with a Konva-based editor.

**Terminology that must stay consistent:** *client* (a managed brand, not a Kontuur customer), *agency* (the tenant root — used even in solo mode), *content pillar*, *theme*, *source*, *brand profile*, *review queue*, *approval token*, *posting schedule*.

**Naming constraint:** the product is **Kontuur** (kontuur.app). The npm package, repo folder, and some internal identifiers are still `postflow` — legacy, being phased out. Never surface "PostFlow" in the UI.

**Technical constraints:** multi-tenancy is enforced by Row Level Security scoped to `agency_id` on every table, so anything user-facing must be reachable under RLS; server routes that bypass it use an admin client and scope queries by hand. UI never imports AI logic directly — everything crosses a server boundary.

**Pricing as implemented:** two tiers at €49 and €99, with a 14-day free trial and no credit card required. Stripe billing fields exist as scaffolding only.

**Open / undecided — do not invent answers:**

- **Instagram self-serve OAuth works.** The Meta Access Verification block recorded on 2026-07-29 is resolved as of 2026-07-30; clients connect through the normal flow with no workaround. A low connected-client count is therefore an ordinary onboarding gap the user can fix themselves, not a structural dead end — surfaces should offer Connect directly rather than routing around a failure.
- Billing and plan enforcement are scaffolding, not a shipped flow.
- No confirmed accessibility standard has been set (see below).

## Brand Commitments

- **Name:** Kontuur / kontuur.app.
- **Bilingual by design:** Bulgarian and English are both first-class. Bulgarian is not a translation afterthought — it is the language the authenticity layer was built for.
- Visual authority belongs in [DESIGN.md](DESIGN.md), which is the single design document. This file deliberately does not restate or extend it. (It previously pointed at `docs/STYLE-GUIDE.md`, which was folded into DESIGN.md and deleted on 2026-08-01.)

## Evidence on Hand

**There is no real customer proof today.** No nameable customers, no engagement metrics, no testimonials, no case studies, no press.

This is a hard constraint on every future surface: **do not invent logos, customer counts, testimonials, star ratings, "trusted by" claims, or performance numbers**, and do not pad a proof row to look fuller.

Known defect to fix rather than preserve: [src/features/marketing/components/SocialProof.tsx](src/features/marketing/components/SocialProof.tsx) currently renders `'Agency 2'` through `'Agency 5'` as placeholder names under the claim "Trusted by agencies in Bulgaria and across Europe". That claim is not currently substantiated and the placeholders must not ship.

Real assets that do exist: the product itself and its live data flows, the documentation in [docs/](docs/), and redesign mock imagery in [docs/redesign-mocks/](docs/redesign-mocks/).

## Product Principles

1. **Ground every claim in a real source.** The product's core promise is that content traces back to something true — the same standard applies to the marketing surfaces describing it.
2. **Serve both modes honestly.** Agency and solo are meant to be equal, and a surface that only reads well with twelve clients — or only with one — is eventually unfinished. Solo is undeveloped today (see Users), so this is a standard to build toward, not a gate on current work.
3. **The client's voice outranks the product's voice.** Kontuur's personality must never leak into generated content or overshadow the brand being managed.
4. **Approval is a relationship, not a transaction.** The end client meets the product through a token link with no account; that surface carries the agency's credibility.
5. **Autonomy must stay legible.** When crons generate, schedule, and publish unattended, the interface's job is to make what happened — and what is about to happen — obvious and reversible.

## Accessibility & Inclusion

No specific standard (WCAG level or equivalent) has been established for this project — this is an open decision, not a decision to skip.

One product-specific requirement is confirmed: **full Bulgarian and English support**, including Cyrillic rendering. Any typographic or component choice must handle Cyrillic; the existing accent face is Latin-only, so Cyrillic fallback behavior is a real constraint rather than a detail.
