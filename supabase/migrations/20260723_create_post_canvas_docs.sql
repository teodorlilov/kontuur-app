-- Phase 4 canvas editor: the editable text-overlay state ("canvas doc") behind each flattened
-- slide image. One doc per (post_id, position), mirroring uq_post_images_post_position — the
-- flattened jpeg in post_images is what publishes; the doc is what re-opens in the editor.
-- `doc` also carries the clean (text-free) background reference so re-editing never renders
-- text twice over its own baked output.
-- Access is app-level (service-role client + agency ownership via post -> client), matching the
-- rest of the schema — no RLS. `doc` is validated by the zod write-gate before every insert.
-- No triggers: updated_at is set explicitly by the writing route.
-- Idempotent: safe to re-run.

create table if not exists post_canvas_docs (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  position   integer not null default 0,
  doc        jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, position)
);

-- Editor open + approve-attach both look up by post.
create index if not exists post_canvas_docs_post_idx on post_canvas_docs (post_id);

notify pgrst, 'reload schema';
