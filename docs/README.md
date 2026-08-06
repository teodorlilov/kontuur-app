# Kontuur Documentation

Start with **[OVERVIEW.md](./OVERVIEW.md)** — the single source of truth for what Kontuur
is, how it's architected, and every feature in the codebase.

## Current reference

| Doc                                                              | What it covers                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [OVERVIEW.md](./OVERVIEW.md)                                     | Product, architecture, data model, full feature catalog, integrations, cron, API surface                                        |
| [DESIGN.md](../DESIGN.md)                                        | Kontuur design system — the single design document. Colours, typography, spacing, named rules, and how they are spelled in code |
| [PRODUCT.md](../PRODUCT.md)                                      | What the product promises and who it is for                                                                                     |
| [CLAUDE.md](./CLAUDE.md)                                         | Code-quality rules (DRY, single source of truth, function/naming limits)                                                        |
| [TECH-DEBT.md](./TECH-DEBT.md)                                   | Every deferred issue, with why it was deferred and the intended fix                                                             |
| [DB-GEN-TYPES.md](./DB-GEN-TYPES.md)                             | Regenerating `src/types/database.ts` after a migration                                                                          |
| [RLS-SECURITY-REVIEW.md](./RLS-SECURITY-REVIEW.md)               | Row Level Security review of the Supabase tables                                                                                |
| [CODING_SKILLS.md](./CODING_SKILLS.md)                           | LLM coding-behaviour guidelines                                                                                                 |
| [VISUAL-GENERATION-PRD.md](./VISUAL-GENERATION-PRD.md)           | Design rationale for the shipped visual-generation subsystem                                                                    |
| [claude-md-audit-2026-08-05.md](./claude-md-audit-2026-08-05.md) | Point-in-time CLAUDE.md compliance audit; deferrals live in TECH-DEBT §6                                                        |

## Feature plans — [`plans/`](./plans/)

Implementation plans for individual features. The first three are **shipped**; the code is
the source of truth and these remain for design rationale.

| Doc                                                      | Status                                  |
| -------------------------------------------------------- | --------------------------------------- |
| [plans/PUBLISHING.md](./plans/PUBLISHING.md)             | Shipped — Instagram publishing pipeline |
| [plans/NOTIFICATION.md](./plans/NOTIFICATION.md)         | Shipped — client-response notifications |
| [plans/CLIENT_IDEAS.md](./plans/CLIENT_IDEAS.md)         | Shipped — client idea submission        |
| [plans/LANDING-REDESIGN.md](./plans/LANDING-REDESIGN.md) | Shipped — marketing landing redesign    |

Mocks for the 2026 app redesign live in [`redesign-mocks/`](./redesign-mocks/); the shipped
surfaces are the source of truth, and the mocks remain for direction rationale.

## Archive — [`archive/`](./archive/)

The original "PostFlow" planning documents. **Superseded by OVERVIEW.md** and kept for history —
they describe an earlier folder structure (Next.js 14, `lib/anthropic/`) that no longer matches
the code.

| Doc                                                    | What it was                               |
| ------------------------------------------------------ | ----------------------------------------- |
| [archive/MASTER_PROMPT.md](./archive/MASTER_PROMPT.md) | Original master build spec                |
| [archive/ARCHITECTURE.md](./archive/ARCHITECTURE.md)   | Original Session-0 technical architecture |
| [archive/SESSIONS.md](./archive/SESSIONS.md)           | Original 9-session build plan             |

## Other

- [`archive/sql/`](./archive/sql/) — early SQL snapshots, kept for history. The **only live SQL**
  is [`supabase/migrations/`](../supabase/migrations/); the generated schema types live in
  `src/types/database.ts`.
