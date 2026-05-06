-- Add NOT NULL constraints to columns that should never be null.
-- This fixes Supabase-generated types emitting `| null` for required fields.

-- posting_schedules
alter table posting_schedules alter column client_id set not null;
alter table posting_schedules alter column is_active set not null;
alter table posting_schedules alter column frequency_value set not null;
alter table posting_schedules alter column auto_generate_day set not null;

-- post_approval_tokens
alter table post_approval_tokens alter column post_id set not null;
alter table post_approval_tokens alter column expires_at set not null;
alter table post_approval_tokens alter column status set not null;

-- posts
alter table posts alter column client_id set not null;
alter table posts alter column platform set not null;
alter table posts alter column post_type set not null;

-- clients
alter table clients alter column language set not null;
alter table clients alter column posts_per_week set not null;

-- users
alter table users alter column agency_id set not null;
alter table users alter column role set not null;
