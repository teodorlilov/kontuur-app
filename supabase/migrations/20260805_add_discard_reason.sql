-- The review queue's discard toast now captures WHY a post was rejected —
-- the per-source usefulness signal discarded_drafts was built for. Values
-- mirror the reason chips; null = the reviewer skipped the question.
alter table discarded_drafts add column if not exists reason text
  check (reason is null or reason in
    ('off_brand','repetitive','wrong_facts','weak_source','bad_timing'));

notify pgrst, 'reload schema';
