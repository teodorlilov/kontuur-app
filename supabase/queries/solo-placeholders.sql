-- Solo placeholder review — paste into the Supabase dashboard SQL editor.
--
-- Until 2026-09-12, solo signup inserted a name-only "placeholder" client in the same
-- createUserRecord call as the agency (src/lib/auth/create-user-record.ts before that date), and
-- the solo navigation never led to /clients/new — so the account had a client the product knew
-- nothing about, and the first-run gate (src/features/onboarding/lib/require-business-setup.ts)
-- never fires for it because a client exists. This lists every such placeholder with the signals
-- that would say a human used it, so the ones nobody touched can be deleted by hand and their
-- owners are sent through setup on their next sign-in.
--
-- Two things make a placeholder recognisable:
--   * it is minted with its agency — the old path inserted agency, user and client in one
--     request, so `clients.created_at` trails `agencies.created_at` by a few hundred
--     milliseconds (both `timestamp default now()`, 00000000_baseline.sql); anything made
--     through /clients/new needs two page loads and two clicks first, so 2 seconds separates
--     the two cleanly;
--   * every human-editable column still holds what signup left: the agency's own name, the
--     baseline defaults on `clients`, `brand_profiles` and `posting_schedules`, a `default`
--     visual identity, and at most the auto-seeded web-research source (type 'tavily' — its
--     label varies between generations, so it is never compared).
--
-- The `cron_*` columns are NOISE, not signals: the placeholder's default schedule is active
-- (monday 09:00, 3/week), so the hourly generate cron (src/app/api/cron/generate/route.ts) has
-- produced pending_review posts, post_history rows, `posts_ready` notifications and visuals for
-- every placeholder older than a week. Treating those as human activity would protect all of
-- them. What the cron cannot produce is the list of `has_*` columns: a status past pending_review,
-- an edited post, a connected account, a user-added source, an idea, a changed profile field.
--
-- Read-only. Review the rows, then delete the ones you agree with in the same editor:
--   delete from public.clients where id in ('…', '…') returning name;
-- Children go by cascade (20260820_cascade_client_deletes.sql). Two things SQL does not do:
--   * objects under post-images/{client_id}/ in Storage stay (public bucket, AI visuals for a
--     name-only business) — remove those folders in the Storage UI first, or accept them;
--   * the client-list cache is not busted, so the affected account may see its old dashboard
--     once more before the gate fires on the next full load.
-- Apply only AFTER the code that stops minting placeholders is deployed.

with signals as (
  select
    c.id                                                             as client_id,
    a.name                                                           as agency_name,
    c.name                                                           as client_name,
    c.created_at,
    (c.name is distinct from a.name
      or c.niche is not null or c.website_url is not null or c.contact_email is not null
      or c.language is distinct from 'English'
      or c.posts_per_week is distinct from 3)                        as has_client_edits,
    exists (
      select 1 from public.brand_profiles bp
      where bp.client_id = c.id
        and (bp.tone is not null or bp.target_audience is not null
          or bp.content_pillars is not null or bp.avoid_topics is not null
          or bp.social_goals is not null or bp.secondary_language is not null
          or bp.default_post_type is distinct from 'single'
          or bp.default_carousel_slides is distinct from 6
          or bp.weekly_mix_json is distinct from '{"single": 1, "carousel": 2}'::jsonb
          or bp.language_formality is distinct from 'neutral'
          or bp.is_health_niche is distinct from false
          or bp.language_notes is distinct from '')
    )                                                                as has_brand_profile_edits,
    exists (
      select 1 from public.posting_schedules ps
      where ps.client_id = c.id
        and (ps.is_active = false or ps.frequency_value <> 3
          or ps.auto_generate_day <> 'monday'
          or ps.auto_generate_time is distinct from '09:00'
          or ps.frequency_type is distinct from 'per_week')
    )                                                                as has_schedule_edits,
    exists (select 1 from public.brand_visual_identity v
            where v.client_id = c.id and v.source_kind <> 'default') as has_visual_identity,
    exists (select 1 from public.social_connections sc where sc.client_id = c.id)
                                                                     as has_connection,
    exists (
      select 1 from public.client_sources s
      where s.client_id = c.id
        and (s.type <> 'tavily' or s.is_active = false or s.config <> '{}'::jsonb)
    )                                                                as has_source_edits,
    exists (select 1 from public.client_ideas i where i.client_id = c.id)      as has_ideas,
    exists (select 1 from public.discarded_drafts d where d.client_id = c.id)  as has_discards,
    exists (select 1 from public.client_style_memos m where m.client_id = c.id) as has_style_memo,
    exists (select 1 from public.generation_runs g
            where g.client_id = c.id and g.kind <> 'cron')           as has_manual_run,
    exists (
      select 1 from public.posts p
      where p.client_id = c.id
        and (p.status <> 'pending_review' or p.edited_at is not null
          or p.was_rewritten or p.rewrite_count > 0)
    )                                                                as has_post_decisions,
    exists (select 1 from public.posts p
            join public.post_canvas_docs cd on cd.post_id = p.id
            where p.client_id = c.id)                                as has_canvas_docs,
    exists (select 1 from public.posts p
            join public.post_approval_tokens t on t.post_id = p.id
            where p.client_id = c.id)                                as has_approval_tokens,
    exists (select 1 from public.posts p
            join public.post_publications pub on pub.post_id = p.id
            where p.client_id = c.id)                                as has_publications,
    exists (select 1 from public.notifications n
            where n.client_id = c.id and n.type is distinct from 'posts_ready')
                                                                     as has_other_notifications,
    (select count(*) from public.posts x where x.client_id = c.id)   as cron_posts,
    (select count(*) from public.post_images img
     join public.posts x on x.id = img.post_id
     where x.client_id = c.id)                                       as cron_post_images
  from public.clients c
  join public.agencies a on a.id = c.agency_id
  where a.mode = 'solo'
    and c.created_at <= a.created_at + interval '2 seconds'
)
select
  *,
  not (has_client_edits or has_brand_profile_edits or has_schedule_edits or has_visual_identity
    or has_connection or has_source_edits or has_ideas or has_discards or has_style_memo
    or has_manual_run or has_post_decisions or has_canvas_docs or has_approval_tokens
    or has_publications or has_other_notifications)                  as would_delete
from signals
order by would_delete desc, agency_name;
