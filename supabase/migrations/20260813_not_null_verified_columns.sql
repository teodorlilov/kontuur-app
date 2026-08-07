-- Columns the app always writes, said out loud in the schema.
--
-- Each one below was verified twice before being included: a null-count query over
-- prod returned 0, AND every insert path in the code sets it. The data alone was not
-- treated as sufficient — with 1 row in analytics_reports and 1 in social_connections,
-- "0 nulls" says nothing about intent, only that this migration will not fail.
--
-- Why it matters: hand-written types across the app already declare these non-null, so
-- today the code and the schema disagree and the code wins by assertion. Closing the
-- gap lets those types derive from the generated row types instead of restating them,
-- which is what stopped migration 20260506 from reaching the app for three months.
--
-- Verified writers:
--   clients.agency_id            all three inserts (signup, createClient, create-user-record)
--   brand_profiles.client_id     created alongside its client, never standalone
--   analytics_reports.*          the report route sets all five explicitly; the first four
--                                are also its onConflict key, so they were never optional,
--                                and generateAnalyticsSummary returns Promise<string>
--   social_connections.*         the Meta callback sets platform/account_id/account_name on
--                                both the instagram and facebook branches, with fallbacks
--                                so none can be empty
--   notifications.agency_id      every insert site sets it
--
-- DELIBERATELY EXCLUDED — agencies.plan, subscription_status, trial_ends_at and
-- plan_client_limit. They read as non-null in prod only because column defaults fill
-- them: no code path writes any of the four, and billing is not implemented yet.
-- Constraining them now would encode assumptions about a flow that has not been
-- designed. trial_ends_at should stay nullable regardless — an active paid agency has
-- no trial end date, and the UI already guards for its absence
-- (plan-section.tsx renders it only when trialing or expired).

-- Bookkeeping columns: no insert sets these, so give them a default before NOT NULL —
-- otherwise an insert that omits the column starts failing.
alter table notifications alter column is_read set default false;
alter table notifications alter column created_at set default now();
alter table social_connections alter column created_at set default now();
alter table analytics_reports alter column created_at set default now();

update notifications set is_read = false where is_read is null;
update notifications set created_at = now() where created_at is null;
update social_connections set created_at = now() where created_at is null;
update analytics_reports set created_at = now() where created_at is null;

alter table notifications alter column is_read set not null;
alter table notifications alter column created_at set not null;
alter table social_connections alter column created_at set not null;
alter table analytics_reports alter column created_at set not null;

-- Foreign keys and always-supplied fields: no default is appropriate — a row without
-- them is meaningless, so the constraint should reject rather than invent a value.
alter table notifications alter column agency_id set not null;
alter table clients alter column agency_id set not null;
alter table brand_profiles alter column client_id set not null;

alter table social_connections alter column platform set not null;
alter table social_connections alter column account_id set not null;
alter table social_connections alter column account_name set not null;

alter table analytics_reports alter column client_id set not null;
alter table analytics_reports alter column platform set not null;
alter table analytics_reports alter column period_start set not null;
alter table analytics_reports alter column period_end set not null;
alter table analytics_reports alter column ai_summary set not null;
