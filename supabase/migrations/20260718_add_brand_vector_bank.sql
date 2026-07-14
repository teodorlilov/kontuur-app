-- Increment 4: the per-brand vector library (Recraft text-to-vector).
--
-- `brand_vector_bank` holds a brand's reusable on-brand vector marks (icons, patterns, silhouettes) as
-- true SVG source, keyed by (client, prompt_hash). The onboarding design system seeds a starter set from
-- the brief's motifs (`onboarding:<n>`); later the editor generates + stores more, keyed by copy/motif
-- hash. App-level access only (no RLS), same as brand_image_bank / brand_kits — every read via the admin
-- client, agency-scoped in code. SVG is stored inline (small, text) rather than in a bucket.

create table if not exists brand_vector_bank (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text,                 -- the motif/prompt this mark was generated from (operator-facing)
  prompt_hash text not null,  -- cache key: 'onboarding:<n>' for the starter set; copy/motif hash later
  svg text not null,          -- sanitised SVG source (Recraft returns real, scalable SVG)
  created_at timestamptz not null default now()
);

-- One mark per (brand, prompt) — the cache key. Unique so a concurrent double-generate can't duplicate.
create unique index if not exists brand_vector_bank_client_hash_idx
  on brand_vector_bank (client_id, prompt_hash);
