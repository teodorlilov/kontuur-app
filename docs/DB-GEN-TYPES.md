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
npx supabase link --project-ref oxkcaeqxzklvfrpsdbhd
npx supabase gen types typescript --linked > src/types/database.ts
```

Then check the diff: it should contain only the columns you changed. Anything
else means the local schema and production have drifted apart.
