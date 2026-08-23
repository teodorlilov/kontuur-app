-- Schema baseline, generated from production by supabase/queries/schema-baseline.sql.
-- Regenerate with that query rather than editing this file by hand.
-- Policies live in 20260818_capture_rls_policy_baseline.sql, not here.

create table if not exists public.agencies (
  id uuid default gen_random_uuid() not null,
  name text not null,
  plan text default 'free'::text,
  mode text default 'agency'::text,
  agency_logo text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'trialing'::text,
  trial_ends_at timestamp without time zone default (now() + '14 days'::interval),
  plan_client_limit integer default 1,
  created_at timestamp without time zone default now(),
  timezone text default 'UTC'::text not null
);

create table if not exists public.analytics_reports (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  platform text not null,
  period_start date not null,
  period_end date not null,
  metrics_json jsonb,
  ai_summary text not null,
  created_at timestamp without time zone default now() not null,
  ig_account_id text
);

create table if not exists public.brand_image_bank (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  prompt_hash text not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.brand_kit_extractions (
  id uuid default gen_random_uuid() not null,
  onboarding_session_id uuid not null,
  agency_id uuid,
  status text default 'pending'::text not null,
  report jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  identity jsonb
);

create table if not exists public.brand_profiles (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  tone text,
  target_audience text,
  content_pillars text,
  avoid_topics text,
  default_post_type text default 'single'::text,
  default_carousel_slides integer default 6,
  weekly_mix_json jsonb default '{"single": 1, "carousel": 2}'::jsonb,
  language_formality text default 'neutral'::text,
  secondary_language text,
  is_health_niche boolean default false,
  best_time_json jsonb,
  best_time_updated_at timestamp without time zone,
  source_strategy jsonb default '{"rss": true, "file": true, "website": true, "trend_fallback": true}'::jsonb not null,
  language_notes text default ''::text,
  social_goals text
);

create table if not exists public.brand_vector_bank (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  label text,
  prompt_hash text not null,
  svg text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.brand_visual_identity (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  identity jsonb not null,
  source_kind text default 'default'::text not null,
  report jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.client_assets (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  storage_path text not null,
  public_url text not null,
  label text,
  kind text default 'product'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.client_ideas (
  id uuid default gen_random_uuid() not null,
  agency_id uuid not null,
  client_id uuid not null,
  token_id uuid not null,
  idea_text text not null,
  extra_notes text,
  platform text,
  target_date text,
  status text default 'new'::text not null,
  generated_post_id uuid,
  submitted_at timestamp with time zone default now() not null,
  read_at timestamp with time zone
);

create table if not exists public.client_sources (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  type text not null,
  label text not null,
  url text not null,
  is_active boolean default true not null,
  last_fetched_at timestamp with time zone,
  last_fetch_status text,
  last_fetch_error text,
  config jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  file_path text,
  extracted_text text,
  source_summary text,
  source_summary_at timestamp with time zone,
  pillar_ids jsonb default '[]'::jsonb not null
);

create table if not exists public.client_style_memos (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  memo jsonb default '[]'::jsonb not null,
  report jsonb,
  reviewed_through timestamp with time zone default '1970-01-01 00:00:00+00'::timestamp with time zone not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.clients (
  id uuid default gen_random_uuid() not null,
  agency_id uuid not null,
  name text not null,
  niche text,
  posts_per_week integer default 3 not null,
  language text default 'English'::text not null,
  created_at timestamp without time zone default now(),
  website_url text,
  contact_email text
);

create table if not exists public.discarded_drafts (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  client_source_id uuid,
  pillar text,
  source_url text,
  source_type text,
  platform text,
  discarded_from text not null,
  created_at timestamp with time zone default now() not null,
  reason text
);

create table if not exists public.generation_runs (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  platform text,
  created_at timestamp without time zone default now(),
  status text default 'complete'::text not null,
  target_count integer,
  completed_at timestamp with time zone,
  kind text default 'cron'::text not null,
  slot_key timestamp with time zone
);

create table if not exists public.generation_themes (
  id uuid default gen_random_uuid() not null,
  run_id uuid,
  theme_description text,
  post_count integer default 1,
  is_priority boolean default false,
  priority_brief text,
  target_date date,
  research_used boolean default false
);

create table if not exists public.idea_form_tokens (
  id uuid default gen_random_uuid() not null,
  agency_id uuid not null,
  client_id uuid not null,
  token text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.ig_account_metrics (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  metric_date date not null,
  followers_count integer,
  follows_count integer,
  media_count integer,
  reach integer,
  views integer,
  accounts_engaged integer,
  total_interactions integer,
  likes integer,
  comments integer,
  saves integer,
  shares integer,
  replies integer,
  reposts integer,
  profile_views integer,
  website_clicks integer,
  follows integer,
  unfollows integer,
  profile_links_taps integer,
  reach_by_media_product_type jsonb,
  interactions_by_media_product_type jsonb,
  link_taps_by_button_type jsonb,
  totals_synced_at timestamp with time zone,
  ig_account_id text not null,
  online_followers_by_hour jsonb
);

create table if not exists public.ig_audience_snapshots (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  snapshot_date date not null,
  follower_demographics jsonb,
  engaged_audience_demographics jsonb,
  ig_account_id text not null
);

create table if not exists public.ig_post_metrics (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  post_id uuid,
  ig_media_id text not null,
  media_type text,
  media_product_type text,
  permalink text,
  thumbnail_url text,
  caption text,
  posted_at timestamp with time zone,
  reach integer,
  views integer,
  like_count integer,
  comments_count integer,
  saved integer,
  shares integer,
  total_interactions integer,
  follows integer,
  profile_visits integer,
  last_synced_at timestamp with time zone default now() not null,
  ig_account_id text not null
);

create table if not exists public.image_generation_usage (
  agency_id uuid not null,
  month text not null,
  count integer default 0 not null
);

create table if not exists public.intelligence_briefings (
  id uuid default gen_random_uuid() not null,
  agency_id uuid,
  briefing_text text,
  platform_updates text[],
  trending_topics jsonb,
  action_nudge text,
  weekly_tip text,
  sources text[],
  week_start date,
  created_at timestamp without time zone default now(),
  coaching_points jsonb
);

create table if not exists public.language_rules (
  id uuid default gen_random_uuid() not null,
  language text not null,
  banned_anglicisms jsonb,
  banned_calques jsonb,
  native_cta_phrases jsonb,
  formality_default text default 'neutral'::text,
  formality_rules jsonb default '{}'::jsonb,
  language_instructions text default ''::text,
  opener_examples jsonb default '[]'::jsonb
);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() not null,
  agency_id uuid not null,
  message text,
  is_read boolean default false not null,
  created_at timestamp without time zone default now() not null,
  type text,
  client_id uuid,
  post_id uuid,
  feedback_text text,
  review_token text
);

create table if not exists public.post_approval_tokens (
  id uuid default gen_random_uuid() not null,
  post_id uuid not null,
  token text default (gen_random_uuid())::text,
  client_email text,
  status text default 'pending'::text not null,
  client_note text,
  expires_at timestamp without time zone default (now() + '48:00:00'::interval) not null,
  created_at timestamp without time zone default now(),
  batch_id uuid,
  responded_at timestamp with time zone
);

create table if not exists public.post_canvas_docs (
  id uuid default gen_random_uuid() not null,
  post_id uuid not null,
  "position" integer default 0 not null,
  doc jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.post_history (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  topic_summary text,
  created_at timestamp without time zone default now()
);

create table if not exists public.post_images (
  id uuid default gen_random_uuid() not null,
  post_id uuid not null,
  public_url text not null,
  storage_path text not null,
  "position" integer default 0 not null,
  file_name text,
  file_size integer,
  content_type text,
  created_at timestamp with time zone default now(),
  source text default 'upload'::text not null
);

create table if not exists public.posting_schedules (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  is_active boolean default true not null,
  frequency_type text default 'per_week'::text,
  frequency_value integer default 3 not null,
  auto_generate_day text default 'monday'::text not null,
  auto_generate_time text default '09:00'::text,
  created_at timestamp without time zone default now()
);

create table if not exists public.posts (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  caption text,
  platform text not null,
  post_type text default 'single'::text not null,
  slides_json jsonb,
  status text default 'draft'::text not null,
  priority boolean default false not null,
  scheduled_at timestamp without time zone,
  published_at timestamp without time zone,
  quality_score_avg numeric,
  was_rewritten boolean default false not null,
  rewrite_count integer default 0 not null,
  created_at timestamp without time zone default now() not null,
  source_url text,
  source_title text,
  source_type text,
  pillar text,
  source_excerpt text,
  image_url text,
  validation_json jsonb,
  ig_creation_id text,
  ig_media_id text,
  publish_error text,
  publish_attempts integer default 0 not null,
  visuals_attempts integer default 0 not null,
  design_json jsonb,
  design_overrides jsonb,
  brand_kit_version integer,
  format text default 'portrait'::text not null,
  client_source_id uuid,
  topic_summary text,
  publish_claimed_at timestamp with time zone,
  generated_caption text,
  generated_slides_json jsonb,
  edited_at timestamp with time zone,
  ig_account_id text,
  visuals_attempted_at timestamp with time zone
);

create table if not exists public.social_connections (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  platform text not null,
  account_id text not null,
  account_name text not null,
  access_token text,
  token_expires_at timestamp without time zone,
  created_at timestamp without time zone default now() not null,
  refresh_token text,
  user_id uuid,
  last_sync_at timestamp with time zone,
  last_sync_error text
);

create table if not exists public.users (
  id uuid not null,
  agency_id uuid not null,
  email text not null,
  role text default 'admin'::text not null,
  created_at timestamp without time zone default now()
);

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'agencies_pkey' and conrelid = 'public.agencies'::regclass) then
    alter table public.agencies add constraint agencies_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_reports_client_account_period_key' and conrelid = 'public.analytics_reports'::regclass) then
    alter table public.analytics_reports add constraint analytics_reports_client_account_period_key UNIQUE (client_id, ig_account_id, platform, period_start, period_end);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_reports_pkey' and conrelid = 'public.analytics_reports'::regclass) then
    alter table public.analytics_reports add constraint analytics_reports_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_image_bank_pkey' and conrelid = 'public.brand_image_bank'::regclass) then
    alter table public.brand_image_bank add constraint brand_image_bank_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_kit_extractions_onboarding_session_id_key' and conrelid = 'public.brand_kit_extractions'::regclass) then
    alter table public.brand_kit_extractions add constraint brand_kit_extractions_onboarding_session_id_key UNIQUE (onboarding_session_id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_kit_extractions_pkey' and conrelid = 'public.brand_kit_extractions'::regclass) then
    alter table public.brand_kit_extractions add constraint brand_kit_extractions_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_profiles_client_id_key' and conrelid = 'public.brand_profiles'::regclass) then
    alter table public.brand_profiles add constraint brand_profiles_client_id_key UNIQUE (client_id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_profiles_pkey' and conrelid = 'public.brand_profiles'::regclass) then
    alter table public.brand_profiles add constraint brand_profiles_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_vector_bank_pkey' and conrelid = 'public.brand_vector_bank'::regclass) then
    alter table public.brand_vector_bank add constraint brand_vector_bank_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_visual_identity_client_id_key' and conrelid = 'public.brand_visual_identity'::regclass) then
    alter table public.brand_visual_identity add constraint brand_visual_identity_client_id_key UNIQUE (client_id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_visual_identity_pkey' and conrelid = 'public.brand_visual_identity'::regclass) then
    alter table public.brand_visual_identity add constraint brand_visual_identity_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_assets_pkey' and conrelid = 'public.client_assets'::regclass) then
    alter table public.client_assets add constraint client_assets_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_pkey' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_platform_check' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_platform_check CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['Instagram'::text, 'Facebook'::text, 'LinkedIn'::text, 'X / Twitter'::text, 'TikTok'::text]))));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_status_check' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_status_check CHECK ((status = ANY (ARRAY['new'::text, 'generating'::text, 'generated'::text, 'dismissed'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_sources_pkey' and conrelid = 'public.client_sources'::regclass) then
    alter table public.client_sources add constraint client_sources_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_sources_type_check' and conrelid = 'public.client_sources'::regclass) then
    alter table public.client_sources add constraint client_sources_type_check CHECK ((type = ANY (ARRAY['rss'::text, 'website'::text, 'file'::text, 'tavily'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_style_memos_client_id_key' and conrelid = 'public.client_style_memos'::regclass) then
    alter table public.client_style_memos add constraint client_style_memos_client_id_key UNIQUE (client_id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_style_memos_pkey' and conrelid = 'public.client_style_memos'::regclass) then
    alter table public.client_style_memos add constraint client_style_memos_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_pkey' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'discarded_drafts_discarded_from_check' and conrelid = 'public.discarded_drafts'::regclass) then
    alter table public.discarded_drafts add constraint discarded_drafts_discarded_from_check CHECK ((discarded_from = ANY (ARRAY['wizard'::text, 'review'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'discarded_drafts_pkey' and conrelid = 'public.discarded_drafts'::regclass) then
    alter table public.discarded_drafts add constraint discarded_drafts_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'discarded_drafts_reason_check' and conrelid = 'public.discarded_drafts'::regclass) then
    alter table public.discarded_drafts add constraint discarded_drafts_reason_check CHECK (((reason IS NULL) OR (reason = ANY (ARRAY['off_brand'::text, 'repetitive'::text, 'wrong_facts'::text, 'weak_source'::text, 'bad_timing'::text]))));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'generation_runs_kind_check' and conrelid = 'public.generation_runs'::regclass) then
    alter table public.generation_runs add constraint generation_runs_kind_check CHECK ((kind = ANY (ARRAY['cron'::text, 'manual'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'generation_runs_pkey' and conrelid = 'public.generation_runs'::regclass) then
    alter table public.generation_runs add constraint generation_runs_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'generation_runs_status_check' and conrelid = 'public.generation_runs'::regclass) then
    alter table public.generation_runs add constraint generation_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'complete'::text, 'failed'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'generation_themes_pkey' and conrelid = 'public.generation_themes'::regclass) then
    alter table public.generation_themes add constraint generation_themes_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'idea_form_tokens_pkey' and conrelid = 'public.idea_form_tokens'::regclass) then
    alter table public.idea_form_tokens add constraint idea_form_tokens_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'idea_form_tokens_token_key' and conrelid = 'public.idea_form_tokens'::regclass) then
    alter table public.idea_form_tokens add constraint idea_form_tokens_token_key UNIQUE (token);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_account_metrics_client_account_date_key' and conrelid = 'public.ig_account_metrics'::regclass) then
    alter table public.ig_account_metrics add constraint ig_account_metrics_client_account_date_key UNIQUE (client_id, ig_account_id, metric_date);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_account_metrics_pkey' and conrelid = 'public.ig_account_metrics'::regclass) then
    alter table public.ig_account_metrics add constraint ig_account_metrics_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_audience_snapshots_client_account_date_key' and conrelid = 'public.ig_audience_snapshots'::regclass) then
    alter table public.ig_audience_snapshots add constraint ig_audience_snapshots_client_account_date_key UNIQUE (client_id, ig_account_id, snapshot_date);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_audience_snapshots_pkey' and conrelid = 'public.ig_audience_snapshots'::regclass) then
    alter table public.ig_audience_snapshots add constraint ig_audience_snapshots_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_post_metrics_client_account_media_key' and conrelid = 'public.ig_post_metrics'::regclass) then
    alter table public.ig_post_metrics add constraint ig_post_metrics_client_account_media_key UNIQUE (client_id, ig_account_id, ig_media_id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_post_metrics_pkey' and conrelid = 'public.ig_post_metrics'::regclass) then
    alter table public.ig_post_metrics add constraint ig_post_metrics_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'image_generation_usage_pkey' and conrelid = 'public.image_generation_usage'::regclass) then
    alter table public.image_generation_usage add constraint image_generation_usage_pkey PRIMARY KEY (agency_id, month);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'intelligence_briefings_pkey' and conrelid = 'public.intelligence_briefings'::regclass) then
    alter table public.intelligence_briefings add constraint intelligence_briefings_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'language_rules_language_key' and conrelid = 'public.language_rules'::regclass) then
    alter table public.language_rules add constraint language_rules_language_key UNIQUE (language);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'language_rules_pkey' and conrelid = 'public.language_rules'::regclass) then
    alter table public.language_rules add constraint language_rules_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_pkey' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_approval_tokens_pkey' and conrelid = 'public.post_approval_tokens'::regclass) then
    alter table public.post_approval_tokens add constraint post_approval_tokens_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_approval_tokens_token_key' and conrelid = 'public.post_approval_tokens'::regclass) then
    alter table public.post_approval_tokens add constraint post_approval_tokens_token_key UNIQUE (token);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_canvas_docs_pkey' and conrelid = 'public.post_canvas_docs'::regclass) then
    alter table public.post_canvas_docs add constraint post_canvas_docs_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_canvas_docs_post_id_position_key' and conrelid = 'public.post_canvas_docs'::regclass) then
    alter table public.post_canvas_docs add constraint post_canvas_docs_post_id_position_key UNIQUE (post_id, "position");
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_history_pkey' and conrelid = 'public.post_history'::regclass) then
    alter table public.post_history add constraint post_history_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_images_pkey' and conrelid = 'public.post_images'::regclass) then
    alter table public.post_images add constraint post_images_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_images_source_check' and conrelid = 'public.post_images'::regclass) then
    alter table public.post_images add constraint post_images_source_check CHECK ((source = ANY (ARRAY['upload'::text, 'render'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posting_schedules_pkey' and conrelid = 'public.posting_schedules'::regclass) then
    alter table public.posting_schedules add constraint posting_schedules_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_format_check' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_format_check CHECK ((format = ANY (ARRAY['portrait'::text, 'square'::text])));
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_pkey' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_platform_canonical' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_platform_canonical CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['Instagram'::text, 'Facebook'::text, 'LinkedIn'::text, 'TikTok'::text, 'X / Twitter'::text])))) NOT VALID;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'social_connections_client_id_platform_key' and conrelid = 'public.social_connections'::regclass) then
    alter table public.social_connections add constraint social_connections_client_id_platform_key UNIQUE (client_id, platform);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'social_connections_pkey' and conrelid = 'public.social_connections'::regclass) then
    alter table public.social_connections add constraint social_connections_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'social_connections_user_id_platform_key' and conrelid = 'public.social_connections'::regclass) then
    alter table public.social_connections add constraint social_connections_user_id_platform_key UNIQUE (user_id, platform);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_pkey' and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_pkey PRIMARY KEY (id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_reports_client_id_fkey' and conrelid = 'public.analytics_reports'::regclass) then
    alter table public.analytics_reports add constraint analytics_reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_image_bank_client_id_fkey' and conrelid = 'public.brand_image_bank'::regclass) then
    alter table public.brand_image_bank add constraint brand_image_bank_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_kit_extractions_agency_id_fkey' and conrelid = 'public.brand_kit_extractions'::regclass) then
    alter table public.brand_kit_extractions add constraint brand_kit_extractions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_profiles_client_id_fkey' and conrelid = 'public.brand_profiles'::regclass) then
    alter table public.brand_profiles add constraint brand_profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_vector_bank_client_id_fkey' and conrelid = 'public.brand_vector_bank'::regclass) then
    alter table public.brand_vector_bank add constraint brand_vector_bank_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'brand_visual_identity_client_id_fkey' and conrelid = 'public.brand_visual_identity'::regclass) then
    alter table public.brand_visual_identity add constraint brand_visual_identity_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_assets_client_id_fkey' and conrelid = 'public.client_assets'::regclass) then
    alter table public.client_assets add constraint client_assets_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_agency_id_fkey' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_client_id_fkey' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_generated_post_id_fkey' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_generated_post_id_fkey FOREIGN KEY (generated_post_id) REFERENCES posts(id) ON DELETE SET NULL;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_ideas_token_id_fkey' and conrelid = 'public.client_ideas'::regclass) then
    alter table public.client_ideas add constraint client_ideas_token_id_fkey FOREIGN KEY (token_id) REFERENCES idea_form_tokens(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_sources_client_id_fkey' and conrelid = 'public.client_sources'::regclass) then
    alter table public.client_sources add constraint client_sources_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_style_memos_client_id_fkey' and conrelid = 'public.client_style_memos'::regclass) then
    alter table public.client_style_memos add constraint client_style_memos_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_agency_id_fkey' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'discarded_drafts_client_id_fkey' and conrelid = 'public.discarded_drafts'::regclass) then
    alter table public.discarded_drafts add constraint discarded_drafts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'discarded_drafts_client_source_id_fkey' and conrelid = 'public.discarded_drafts'::regclass) then
    alter table public.discarded_drafts add constraint discarded_drafts_client_source_id_fkey FOREIGN KEY (client_source_id) REFERENCES client_sources(id) ON DELETE SET NULL;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'generation_runs_client_id_fkey' and conrelid = 'public.generation_runs'::regclass) then
    alter table public.generation_runs add constraint generation_runs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'generation_themes_run_id_fkey' and conrelid = 'public.generation_themes'::regclass) then
    alter table public.generation_themes add constraint generation_themes_run_id_fkey FOREIGN KEY (run_id) REFERENCES generation_runs(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'idea_form_tokens_agency_id_fkey' and conrelid = 'public.idea_form_tokens'::regclass) then
    alter table public.idea_form_tokens add constraint idea_form_tokens_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'idea_form_tokens_client_id_fkey' and conrelid = 'public.idea_form_tokens'::regclass) then
    alter table public.idea_form_tokens add constraint idea_form_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_account_metrics_client_id_fkey' and conrelid = 'public.ig_account_metrics'::regclass) then
    alter table public.ig_account_metrics add constraint ig_account_metrics_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_audience_snapshots_client_id_fkey' and conrelid = 'public.ig_audience_snapshots'::regclass) then
    alter table public.ig_audience_snapshots add constraint ig_audience_snapshots_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_post_metrics_client_id_fkey' and conrelid = 'public.ig_post_metrics'::regclass) then
    alter table public.ig_post_metrics add constraint ig_post_metrics_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'ig_post_metrics_post_id_fkey' and conrelid = 'public.ig_post_metrics'::regclass) then
    alter table public.ig_post_metrics add constraint ig_post_metrics_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'image_generation_usage_agency_id_fkey' and conrelid = 'public.image_generation_usage'::regclass) then
    alter table public.image_generation_usage add constraint image_generation_usage_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'intelligence_briefings_agency_id_fkey' and conrelid = 'public.intelligence_briefings'::regclass) then
    alter table public.intelligence_briefings add constraint intelligence_briefings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_agency_id_fkey' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_client_id_fkey' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_post_id_fkey' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_approval_tokens_post_id_fkey' and conrelid = 'public.post_approval_tokens'::regclass) then
    alter table public.post_approval_tokens add constraint post_approval_tokens_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_canvas_docs_post_id_fkey' and conrelid = 'public.post_canvas_docs'::regclass) then
    alter table public.post_canvas_docs add constraint post_canvas_docs_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_history_client_id_fkey' and conrelid = 'public.post_history'::regclass) then
    alter table public.post_history add constraint post_history_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_images_post_id_fkey' and conrelid = 'public.post_images'::regclass) then
    alter table public.post_images add constraint post_images_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posting_schedules_client_id_fkey' and conrelid = 'public.posting_schedules'::regclass) then
    alter table public.posting_schedules add constraint posting_schedules_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_client_id_fkey' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_client_source_id_fkey' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_client_source_id_fkey FOREIGN KEY (client_source_id) REFERENCES client_sources(id) ON DELETE SET NULL;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'social_connections_client_id_fkey' and conrelid = 'public.social_connections'::regclass) then
    alter table public.social_connections add constraint social_connections_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'social_connections_user_id_fkey' and conrelid = 'public.social_connections'::regclass) then
    alter table public.social_connections add constraint social_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_agency_id_fkey' and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id);
  end if;
end $baseline$;

do $baseline$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_id_fkey' and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
  end if;
end $baseline$;

CREATE UNIQUE INDEX IF NOT EXISTS brand_image_bank_client_hash_idx ON public.brand_image_bank USING btree (client_id, prompt_hash);

CREATE INDEX IF NOT EXISTS brand_kit_extractions_session_idx ON public.brand_kit_extractions USING btree (onboarding_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS brand_vector_bank_client_hash_idx ON public.brand_vector_bank USING btree (client_id, prompt_hash);

CREATE INDEX IF NOT EXISTS brand_visual_identity_client_idx ON public.brand_visual_identity USING btree (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS client_sources_one_tavily_per_client ON public.client_sources USING btree (client_id) WHERE (type = 'tavily'::text);

CREATE INDEX IF NOT EXISTS discarded_drafts_client_idx ON public.discarded_drafts USING btree (client_id);

CREATE INDEX IF NOT EXISTS discarded_drafts_source_idx ON public.discarded_drafts USING btree (client_source_id) WHERE (client_source_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS generation_runs_active_idx ON public.generation_runs USING btree (created_at DESC) WHERE (status = 'running'::text);

CREATE INDEX IF NOT EXISTS generation_runs_cron_dedup_idx ON public.generation_runs USING btree (client_id, created_at DESC) WHERE (kind = 'cron'::text);

CREATE UNIQUE INDEX IF NOT EXISTS generation_runs_one_batch_per_slot ON public.generation_runs USING btree (client_id, slot_key) WHERE ((kind = 'cron'::text) AND (slot_key IS NOT NULL) AND (status <> 'failed'::text));

CREATE UNIQUE INDEX IF NOT EXISTS idea_form_tokens_one_per_client ON public.idea_form_tokens USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_client_assets_client ON public.client_assets USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_client_ideas_agency ON public.client_ideas USING btree (agency_id);

CREATE INDEX IF NOT EXISTS idx_client_ideas_agency_status ON public.client_ideas USING btree (agency_id, status);

CREATE INDEX IF NOT EXISTS idx_client_ideas_client ON public.client_ideas USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_client_sources_active ON public.client_sources USING btree (client_id, is_active);

CREATE INDEX IF NOT EXISTS idx_client_sources_client_id ON public.client_sources USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON public.clients USING btree (agency_id);

CREATE INDEX IF NOT EXISTS idx_generation_themes_run_id ON public.generation_themes USING btree (run_id);

CREATE INDEX IF NOT EXISTS idx_ig_account_metrics_client_date ON public.ig_account_metrics USING btree (client_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_ig_post_metrics_client_posted ON public.ig_post_metrics USING btree (client_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_ig_post_metrics_post_id ON public.ig_post_metrics USING btree (post_id);

CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON public.notifications USING btree (client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_notifications_post_id ON public.notifications USING btree (post_id) WHERE (post_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_post_approval_tokens_batch_created ON public.post_approval_tokens USING btree (batch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_post_approval_tokens_post_id ON public.post_approval_tokens USING btree (post_id);

CREATE INDEX IF NOT EXISTS idx_post_history_client_id ON public.post_history USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON public.post_images USING btree (post_id);

CREATE INDEX IF NOT EXISTS idx_posting_schedules_client_id ON public.posting_schedules USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_posts_client_id_pillar ON public.posts USING btree (client_id, pillar) WHERE (pillar IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_posts_client_id_status ON public.posts USING btree (client_id, status);

CREATE INDEX IF NOT EXISTS idx_posts_client_status_scheduled ON public.posts USING btree (client_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_posts_due_publish ON public.posts USING btree (scheduled_at) WHERE (status = ANY (ARRAY['scheduled'::text, 'publishing'::text]));

CREATE INDEX IF NOT EXISTS idx_posts_source_url ON public.posts USING btree (source_url) WHERE (source_url IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_posts_status_client_id ON public.posts USING btree (status, client_id);

CREATE INDEX IF NOT EXISTS post_canvas_docs_post_idx ON public.post_canvas_docs USING btree (post_id);

CREATE INDEX IF NOT EXISTS posts_client_source_idx ON public.posts USING btree (client_source_id) WHERE (client_source_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS posts_visuals_backlog ON public.posts USING btree (status, visuals_attempts, visuals_attempted_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_images_post_position ON public.post_images USING btree (post_id, "position");

CREATE OR REPLACE FUNCTION public.client_edit_stats(p_client_id uuid)
 RETURNS TABLE(pending_count bigint, published_count bigint, scheduled_count bigint, approved_unpublished_count bigint, last_generated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending_review'),
    COUNT(*) FILTER (WHERE status = 'published'),
    -- There is no 'scheduled' status: a scheduled post is approved with a scheduled_at.
    COUNT(*) FILTER (WHERE status = 'approved' AND scheduled_at IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'approved' AND published_at IS NULL),
    MAX(created_at)
  FROM posts
  WHERE client_id = p_client_id;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_image_credits(p_agency_id uuid, p_month text, p_cost integer, p_quota integer)
 RETURNS TABLE(allowed boolean, used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_count int;
BEGIN
  INSERT INTO image_generation_usage (agency_id, month, count)
  SELECT p_agency_id, p_month, p_cost
  WHERE p_cost <= p_quota
  ON CONFLICT (agency_id, month) DO UPDATE
    SET count = image_generation_usage.count + p_cost
    WHERE image_generation_usage.count + p_cost <= p_quota
  RETURNING image_generation_usage.count INTO new_count;

  IF new_count IS NULL THEN
    SELECT u.count INTO new_count
    FROM image_generation_usage u
    WHERE u.agency_id = p_agency_id AND u.month = p_month;
    RETURN QUERY SELECT false, COALESCE(new_count, 0);
  ELSE
    RETURN QUERY SELECT true, new_count;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.posts_stamp_edited_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.edited_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_image_credits(p_agency_id uuid, p_month text, p_cost integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE image_generation_usage
  SET count = GREATEST(count - p_cost, 0)
  WHERE agency_id = p_agency_id AND month = p_month;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.swap_rendered_post_images(p_post_id uuid, p_rows jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_paths text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_post_id::text, 0));

  SELECT COALESCE(array_agg(storage_path), ARRAY[]::text[]) INTO old_paths
  FROM post_images
  WHERE post_id = p_post_id AND source = 'render';

  DELETE FROM post_images WHERE post_id = p_post_id AND source = 'render';

  INSERT INTO post_images
    (post_id, public_url, storage_path, position, file_name, file_size, content_type, source)
  SELECT p_post_id, r.public_url, r.storage_path, r."position",
         r.file_name, r.file_size, r.content_type, 'render'
  FROM jsonb_to_recordset(p_rows) AS r(
    public_url text,
    storage_path text,
    "position" int,
    file_name text,
    file_size int,
    content_type text
  );

  RETURN old_paths;
END;
$function$
;

do $baseline$ begin
  if not exists (select 1 from pg_trigger where tgname = 'posts_stamp_edited_at' and tgrelid = 'public.posts'::regclass) then
    CREATE TRIGGER posts_stamp_edited_at BEFORE UPDATE ON public.posts FOR EACH ROW WHEN ((((old.caption IS DISTINCT FROM new.caption) OR (old.slides_json IS DISTINCT FROM new.slides_json)) AND (NOT (new.generated_caption IS DISTINCT FROM old.generated_caption)) AND (NOT (new.generated_slides_json IS DISTINCT FROM old.generated_slides_json)))) EXECUTE FUNCTION posts_stamp_edited_at();
  end if;
end $baseline$;

alter table public.agencies enable row level security;

alter table public.analytics_reports enable row level security;

alter table public.brand_image_bank enable row level security;

alter table public.brand_kit_extractions enable row level security;

alter table public.brand_profiles enable row level security;

alter table public.brand_vector_bank enable row level security;

alter table public.brand_visual_identity enable row level security;

alter table public.client_assets enable row level security;

alter table public.client_ideas enable row level security;

alter table public.client_sources enable row level security;

alter table public.client_style_memos enable row level security;

alter table public.clients enable row level security;

alter table public.discarded_drafts enable row level security;

alter table public.generation_runs enable row level security;

alter table public.generation_themes enable row level security;

alter table public.idea_form_tokens enable row level security;

alter table public.ig_account_metrics enable row level security;

alter table public.ig_audience_snapshots enable row level security;

alter table public.ig_post_metrics enable row level security;

alter table public.image_generation_usage enable row level security;

alter table public.intelligence_briefings enable row level security;

alter table public.language_rules enable row level security;

alter table public.notifications enable row level security;

alter table public.post_approval_tokens enable row level security;

alter table public.post_canvas_docs enable row level security;

alter table public.post_history enable row level security;

alter table public.post_images enable row level security;

alter table public.posting_schedules enable row level security;

alter table public.posts enable row level security;

alter table public.social_connections enable row level security;

alter table public.users enable row level security;
