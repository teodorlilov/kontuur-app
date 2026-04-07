Ready for review
Select text to add comments on the plan
Unimplemented Features Audit — PostFlow
Context
Review of docs/MASTER_PROMPT.md spec against actual codebase state. Based on exploration of all routes, API endpoints, AI modules, and components.

NOT IMPLEMENTED (spec exists, code does not)
1. Analytics Page — /analytics
Only loading.tsx skeleton exists; no page.tsx
No src/features/analytics/ directory or components
No Recharts usage for analytics
Missing: metric cards, AI summary box, bar charts, top posts table, report history
2. Meta Graph API Integration
No code to call Meta API for Instagram/Facebook insights
Missing endpoints for fetching: followers, reach, impressions, per-post metrics
No analytics_reports table write logic
No AI summary generation from metrics
3. Meta OAuth Flow — /api/auth/meta
No /api/auth/meta or /api/auth/meta/callback routes
No social_connections table write logic
The "Connected accounts" section in /clients/[id]/edit is missing entirely
4. PDF Export for Analytics Reports
jsPDF is in package.json but only used to parse uploaded PDFs (not export)
No lib/pdf/report.ts or equivalent
No "Export PDF" button in analytics UI
5. Autonomous Cron Job — /api/cron/generate
No cron API route exists
No vercel.json in project root
No scheduled content generation trigger logic
6. Intelligence Briefing Generation
intelligence_briefings DB table exists and dashboard displays it
But no API endpoint or background job to generate weekly briefings
No /api/ai/intelligence route (referenced in ARCHITECTURE.md)
7. Approval Email Sending via Resend
/api/approval/send creates the token + approval link and creates a notification
But Resend email send call is not present in that route
The actual email to the client is not sent
PARTIALLY IMPLEMENTED
Cron/Autonomous Scheduling
posting_schedules table exists with is_active, auto_generate_day, auto_generate_time
Brand profile has weekly_mix_json
But cron job that reads these and triggers generation is missing
FULLY IMPLEMENTED (confirmed)
Auth (login, signup, team invite, password setup)
Dashboard with stats
Clients (list, create, edit)
Smart onboarding (AI interview + URL analysis)
Generate flow (single, carousel, reels, priority posts, research, pillar selector)
Quality validation + language validation + slop detector
Review queue with filters, batch actions, rewrite
Calendar (monthly grid, scheduling, best-time panel, drag-to-schedule)
Settings (team + account)
Approval portal (public token page, per-post notes, 48h expiry)
Research sources (RSS, website, file upload, CRUD, strategy toggles)
Best time recommendations
Notifications bell
Add Comment