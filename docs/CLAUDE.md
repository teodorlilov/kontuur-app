# PostFlow — Project Context

## What this project is
A SaaS platform for social media marketing agencies.
Full spec: docs/MASTER_PROMPT.md
Technical standards: docs/ARCHITECTURE.md
Build sessions: docs/SESSIONS.md

## Stack
Next.js 14 App Router · TypeScript strict · Supabase · Tailwind · Anthropic API

## Critical rules
- Named exports only, no default exports for components
- All AI prompts in lib/anthropic/prompts/ as separate files
- Server Supabase client in API routes, browser client in hooks only
- Never call Anthropic API from components
- RLS on every Supabase table

## Current status
[Update this as you complete sessions]
Session 1 complete — project structure and database done
Session 2 complete — auth and layout done
...

## Commands to run the project
npm run dev       — start dev server at localhost:3000
npx tsc --noEmit  — check TypeScript errors
npm run build     — test production build