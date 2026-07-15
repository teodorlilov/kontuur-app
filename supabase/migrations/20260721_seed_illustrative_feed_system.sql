-- Phase B (design variety): add the "Illustrative" style to the shared feed_systems catalog so agencies
-- can pick it. It renders Recraft-generated vector marks + colour graphics instead of photography — its
-- archetype pool + model routing live in code (src/lib/renderer/styles.ts, keyed by this slug). Idempotent.

insert into feed_systems (slug, name, description, font_reqs, photographic, treatment, mark_style, rhythm, plate_budget, params)
values
  ('illustrative', 'Illustrative',
   'Vector illustration and colour blocks instead of photography — a graphic, modern feel. Generated brand marks, no photos.',
   '{"category":"sans"}', 'none', 'mono', 'geometric-filled', 'light-dark-alternate', 0, '{}')
on conflict (slug) do nothing;
