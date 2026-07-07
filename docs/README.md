# Kontuur Documentation

Start with **[OVERVIEW.md](./OVERVIEW.md)** — the single source of truth for what Kontuur
is, how it's architected, and every feature in the codebase.

## Current reference

| Doc | What it covers |
| --- | -------------- |
| [OVERVIEW.md](./OVERVIEW.md) | Product, architecture, data model, full feature catalog, integrations, cron, API surface |
| [STYLE-GUIDE.md](./STYLE-GUIDE.md) | Kontuur design system — colours, typography, spacing, component patterns |
| [CLAUDE.md](./CLAUDE.md) | Code-quality rules (DRY, single source of truth, function/naming limits) |
| [CODING_SKILLS.md](./CODING_SKILLS.md) | LLM coding-behaviour guidelines |

## Feature plans — [`plans/`](./plans/)

Implementation plans for individual features. The first three are **shipped**; the code is
the source of truth and these remain for design rationale.

| Doc | Status |
| --- | ------ |
| [plans/PUBLISHING.md](./plans/PUBLISHING.md) | Shipped — Instagram publishing pipeline |
| [plans/NOTIFICATION.md](./plans/NOTIFICATION.md) | Shipped — client-response notifications |
| [plans/CLIENT_IDEAS.md](./plans/CLIENT_IDEAS.md) | Shipped — client idea submission |
| [plans/AI-GENERATED_TEMPLATES.md](./plans/AI-GENERATED_TEMPLATES.md) | Proposed — AI brand-template image generation (not built) |

## Archive — [`archive/`](./archive/)

The original "PostFlow" planning documents. **Superseded by OVERVIEW.md** and kept for history —
they describe an earlier folder structure (Next.js 14, `lib/anthropic/`) that no longer matches
the code.

| Doc | What it was |
| --- | ----------- |
| [archive/MASTER_PROMPT.md](./archive/MASTER_PROMPT.md) | Original master build spec |
| [archive/ARCHITECTURE.md](./archive/ARCHITECTURE.md) | Original Session-0 technical architecture |
| [archive/SESSIONS.md](./archive/SESSIONS.md) | Original 9-session build plan |

## Other

- [`archive/sql/`](./archive/sql/) — early SQL snapshots, kept for history. The **only live SQL**
  is [`supabase/migrations/`](../supabase/migrations/); the generated schema types live in
  `src/types/database.ts`.
