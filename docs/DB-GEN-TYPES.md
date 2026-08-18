# Regenerating database types

`src/types/database.ts` is generated. Never hand-edit it — regenerate after any
schema change, before writing code against the new columns.

## Setup

The Supabase CLI needs a **personal access token**, created at
https://supabase.com/dashboard/account/tokens.

It is an account-level credential covering every project you can see, so treat
it like a password: keep it in your shell environment or a secret manager, and
never in a file inside this repo.

```sh
export SUPABASE_ACCESS_TOKEN=…   # in your shell profile, not here
```

## Regenerate

```sh
npm run db:link     # npx supabase link --project-ref oxkcaeqxzklvfrpsdbhd
npm run db:types    # npx supabase gen types typescript --linked > src/types/database.ts
```

Both are npm scripts as of 2026-08-18, alongside `db:status`, `db:dump` and `db:rls` —
see `docs/RLS-SECURITY-REVIEW.md`. There is deliberately no `db:push`: the CLI has never
tracked this project's migration history, so a push would replay all 48 files against a
database that already has them.

Then check the diff: it should contain only the columns you changed. Anything
else means the local schema and production have drifted apart.
