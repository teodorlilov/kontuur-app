-- Phase 4 imagery: the per-brand plate bank + the storage bucket generated images live in.
--
-- `brand_image_bank` caches generated background plates keyed by (client, prompt_hash) — a deterministic
-- hash of the slide copy + brand art-direction — so a regenerate or a second post with the same copy
-- reuses the image instead of paying for the LLM scene + fal call again. App-level access only (no RLS),
-- same as post_visuals / brand_kits; every read is via the admin client, agency-scoped in code.

create table if not exists brand_image_bank (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  role text not null,                 -- 'cover' | 'interior'
  prompt_hash text not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

-- One image per (brand, prompt) — the cache key. Unique so a concurrent double-generate can't duplicate.
create unique index if not exists brand_image_bank_client_hash_idx
  on brand_image_bank (client_id, prompt_hash);

-- Public bucket for generated plates (fal's hosted URLs are ephemeral; we copy each image here).
insert into storage.buckets (id, name, public)
values ('plates', 'plates', true)
on conflict (id) do nothing;
