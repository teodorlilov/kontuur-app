# PostFlow — Project Context

## What this project is
A SaaS platform for social media marketing agencies.
Full spec: docs/MASTER_PROMPT.md
Technical standards: docs/ARCHITECTURE.md
Build sessions: docs/SESSIONS.md

## Stack
Next.js 14 App Router · TypeScript strict · Supabase · Tailwind · Anthropic API

## Project structure
```
src/ai/          — AI/ML pipeline (research, generation, validation, rewrite)
src/features/    — React UI feature modules (calendar, review, generate, etc.)
src/components/  — Shared React components (ui, posts, scheduling, layout)
src/app/api/     — API route handlers (thin wrappers calling ai/ and lib/)
src/app/(*)      — Next.js pages (thin wrappers rendering feature components)
src/lib/         — Server infrastructure & data access (supabase, auth, sources)
src/types/       — Shared TypeScript types
src/utils/       — Generic utilities
```

## Critical rules
- Named exports only, no default exports for components
- All AI prompts co-located in `src/ai/*/prompts/` as separate files
- Server Supabase client in API routes, browser client in hooks only
- Never call Anthropic API from components
- Frontend (`src/features/`, `src/components/`) must not import from `src/ai/` — use `@/types/api` for AI types
- RLS on every Supabase table
- `content_pillars` is JSON `[{pillar, weight}]` — always use `parsePillars()`/`serializePillars()` from `lib/clients/content-pillars.ts`, never `.split(',')`

## Current status
[Update this as you complete sessions]
Session 1 complete — project structure and database done
Session 2 complete — auth and layout done
Session 3 complete — dashboard, clients, onboarding, edit
Session 4 complete — generate flow (all post types + quality validation)
Step 9b complete — research sources (CRUD, strategy toggles, file uploads, context cap)
Step 10 complete — review queue page (/review)
Enhanced onboarding complete — URL auto-analysis, improved Q&A (8 questions), weighted content pillars, pillar editor in edit form
Step 11 complete — Calendar page with scheduling (schedule modal on approve, unscheduled strip, monthly grid, drag-to-schedule, side panel with best-time recs, batch scheduling from review queue)
Source grounding complete — fact-checking pipeline (research → generation → validation → UI), per-client toggle, source attribution on posts, source grounding panel on post cards

## Commands to run the project
npm run dev       — start dev server at localhost:3000
npx tsc --noEmit  — check TypeScript errors
npm run build     — test production build