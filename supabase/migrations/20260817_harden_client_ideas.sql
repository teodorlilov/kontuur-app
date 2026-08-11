-- Client ideas: referential integrity, one link per client, and closed vocabularies.
--
-- The tables were created ahead of the feature and never revisited. Four defects:
--
-- 1. Every foreign key is NO ACTION, so deleting a client that ever received an idea
--    raises 23503 and the delete surfaces as a 500. Deleting a *post* that an idea
--    links to fails the same way, while posts/[id]/route.ts returns { success: true }
--    regardless — the caller is told the delete worked when it did not.
-- 2. idea_form_tokens.token is unique but client_id is not, though the original
--    migration's own comment says "one permanent link per client". Both readers use
--    .maybeSingle(), which *errors* once a client holds two rows — so the second
--    token does not just duplicate the link, it breaks the public form for that client.
-- 3. status and platform are free text. Nothing stops a typo'd status from making an
--    idea invisible to every tab at once, since each tab filters by equality.
-- 4. submitted_at is nullable with a default, so the column is only non-null by
--    convention; the row mapper casts it `as string` and would hand `null` to the UI.
--
-- PRE-FLIGHT — run both before applying, the CHECKs below reject anything unexpected:
--
--   select status, count(*) from client_ideas group by status;
--   select platform, count(*) from client_ideas group by platform;
--   select client_id, count(*) from idea_form_tokens group by client_id having count(*) > 1;

-- ── Foreign keys ────────────────────────────────────────────────────────────
--
-- Looked up by column rather than by name: these were created inline by REFERENCES,
-- so the names are Postgres defaults, and asserting them here would make the migration
-- fail on any environment where one was ever recreated by hand.
--
-- Cascade on the three ownership edges, set null on the post link. The distinction is
-- the point: an idea belongs to its client and has no meaning once the client is gone,
-- but an idea whose generated post was deleted is still a real thing a client asked
-- for — it goes back to being unfulfilled rather than disappearing with the post.
--
-- idea_form_tokens is included because client_ideas.token_id references it: without
-- cascading the token too, deleting a client still fails on the token row, which is
-- the defect this exists to fix.

do $$
declare
  spec record;
  con_name text;
begin
  for spec in
    select * from (values
      ('client_ideas', 'agency_id', 'agencies', 'cascade'),
      ('client_ideas', 'client_id', 'clients', 'cascade'),
      ('client_ideas', 'token_id', 'idea_form_tokens', 'cascade'),
      ('client_ideas', 'generated_post_id', 'posts', 'set null'),
      ('idea_form_tokens', 'agency_id', 'agencies', 'cascade'),
      ('idea_form_tokens', 'client_id', 'clients', 'cascade')
    ) as t(tbl, col, ref, action)
  loop
    select c.conname into con_name
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = spec.tbl::regclass
      and c.contype = 'f'
      and a.attname = spec.col
    limit 1;

    if con_name is not null then
      execute format('alter table %I drop constraint %I', spec.tbl, con_name);
    end if;

    execute format(
      'alter table %I add constraint %I foreign key (%I) references %I(id) on delete %s',
      spec.tbl,
      spec.tbl || '_' || spec.col || '_fkey',
      spec.col,
      spec.ref,
      spec.action
    );
  end loop;
end $$;

-- ── One idea link per client ────────────────────────────────────────────────
--
-- Repoint before deleting. token_id now cascades, so deleting a duplicate token row
-- would take its ideas with it — the ideas move to the surviving token first.
-- Oldest wins: it is the token whose URL the client already has.

with keepers as (
  select id,
         first_value(id) over (
           partition by client_id order by created_at nulls last, id
         ) as keeper
  from idea_form_tokens
)
update client_ideas ci
set token_id = k.keeper
from keepers k
where ci.token_id = k.id
  and k.id <> k.keeper;

with keepers as (
  select id,
         first_value(id) over (
           partition by client_id order by created_at nulls last, id
         ) as keeper
  from idea_form_tokens
)
delete from idea_form_tokens t
using keepers k
where t.id = k.id
  and k.id <> k.keeper;

create unique index if not exists idea_form_tokens_one_per_client
  on idea_form_tokens (client_id);

-- ── Closed vocabularies ─────────────────────────────────────────────────────

-- 'generating' is retired. Nothing writes it since the idea generation route was
-- folded into /api/ai/generate-stream; the rows still holding it were stranded —
-- the status was set before the stream and cleared only in a `finally` that cannot
-- run on a lambda timeout. A stranded request is still a request nobody decided
-- on, so those rows go back to 'new' and the inbox. Order matters: the UPDATE must
-- run before the CHECK constrains the vocabulary to the three living values.
update client_ideas set status = 'new' where status = 'generating';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_status_check') then
    alter table client_ideas
      add constraint client_ideas_status_check
      check (status in ('new', 'generated', 'dismissed'));
  end if;
end $$;

-- Display case, matching 20260809's canonicalization of posts.platform and the labels
-- the public form's own buttons submit. Null stays legal: platform is optional on the
-- form, and "the client did not say" is a real answer.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_platform_check') then
    alter table client_ideas
      add constraint client_ideas_platform_check
      check (
        platform is null
        or platform in ('Instagram', 'Facebook', 'LinkedIn', 'X / Twitter', 'TikTok')
      );
  end if;
end $$;

-- ── submitted_at is a fact, not a convention ────────────────────────────────

update client_ideas set submitted_at = now() where submitted_at is null;

alter table client_ideas alter column submitted_at set default now();
alter table client_ideas alter column submitted_at set not null;

-- ── Duplicate indexes ───────────────────────────────────────────────────────
--
-- Each of these is byte-identical in coverage to an index that already exists, so it
-- costs a write on every insert and buys nothing:
--   idx_client_ideas_status      == idx_client_ideas_agency_status (20260505)
--   idx_idea_form_tokens_token   == the UNIQUE constraint's own index on token
--   idx_idea_form_tokens_client  == idea_form_tokens_one_per_client, created above

drop index if exists idx_client_ideas_status;
drop index if exists idx_idea_form_tokens_token;
drop index if exists idx_idea_form_tokens_client;

notify pgrst, 'reload schema';
