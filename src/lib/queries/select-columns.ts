/**
 * Canonical Supabase select column strings.
 *
 * Rules:
 * - Every .select() call for a full row must reference a constant from this file.
 * - Narrow auth checks ('id', 'agency_id') stay inline — intentionally minimal.
 * - Joined selects with relationship filters stay inline at the call site.
 * - If you add a column to a table, update the relevant constant here first.
 */

// posts
export const POST_COLUMNS =
  'id, client_id, caption, platform, post_type, slides_json, image_url, validation_json, status, priority, scheduled_at, published_at, quality_score_avg, was_rewritten, rewrite_count, source_url, source_title, source_type, pillar, source_excerpt, created_at'

// brand_image_bank (per-brand generated-backdrop cache; keyed by client_id + prompt_hash)
export const BRAND_IMAGE_BANK_COLUMNS =
  'id, client_id, prompt_hash, storage_path, public_url, created_at'

// clients
export const CLIENT_COLUMNS =
  'id, name, niche, posts_per_week, language, website_url, contact_email, created_at'

export const CLIENT_LIST_COLUMNS = 'id, name, niche, posts_per_week, language, created_at'

export const CLIENT_CARD_COLUMNS = 'id, name, niche, posts_per_week, language, created_at, brand_profiles(content_pillars)'

// brand_profiles
export const BRAND_PROFILE_COLUMNS =
  'id, tone, target_audience, content_pillars, avoid_topics, client_testimonial_voice, default_post_type, default_carousel_slides, weekly_mix_json, language_formality, secondary_language, is_health_niche, best_time_json, best_time_updated_at, source_strategy, language_notes'

// brand_visual_identity
export const BRAND_VISUAL_IDENTITY_COLUMNS =
  'id, client_id, identity, source_kind, report, created_at, updated_at'

// brand_kit_extractions
export const BRAND_KIT_EXTRACTION_COLUMNS =
  'id, onboarding_session_id, agency_id, status, identity, report, created_at, updated_at'

// posting_schedules
export const POSTING_SCHEDULE_COLUMNS =
  'id, is_active, frequency_type, frequency_value, auto_generate_day, auto_generate_time'

// agencies
export const AGENCY_COLUMNS =
  'id, name, plan, mode, agency_logo, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, plan_client_limit, timezone, created_at'

export const AGENCY_SETTINGS_COLUMNS =
  'id, name, plan, mode, subscription_status, trial_ends_at, plan_client_limit, timezone'

// client_sources
export const CLIENT_SOURCE_COLUMNS =
  'id, client_id, type, label, url, is_active, last_fetched_at, last_fetch_status, last_fetch_error, config, pillar_ids, created_at'

export const CLIENT_SOURCE_FULL_COLUMNS =
  'id, client_id, type, label, url, is_active, last_fetched_at, last_fetch_status, last_fetch_error, config, pillar_ids, file_path, extracted_text, created_at'

// client_sources (research pipeline — active only, with extracted_text for file sources)
export const CLIENT_SOURCE_RESEARCH_COLUMNS = 'id, type, label, url, config, pillar_ids, extracted_text'

// users
export const USER_COLUMNS = 'id, email, role, created_at'

export const USER_AUTH_COLUMNS = 'agency_id, role'

// social_connections
export const SOCIAL_CONNECTION_COLUMNS =
  'id, platform, account_id, account_name, token_expires_at, created_at'

// intelligence_briefings
export const BRIEFING_COLUMNS =
  'briefing_text, action_nudge, weekly_tip, platform_updates, week_start, coaching_points'

// language_rules
export const LANGUAGE_RULES_COLUMNS = 'native_cta_phrases, formality_rules, language_instructions'

// post_history
export const POST_HISTORY_COLUMNS = 'topic_summary'

// post_images
export const POST_IMAGE_COLUMNS =
  'id, post_id, public_url, storage_path, position, file_name, file_size, content_type, created_at'

// posts (top performing)
export const TOP_POSTS_COLUMNS = 'caption'

// client_ideas
export const CLIENT_IDEA_COLUMNS =
  'id, agency_id, client_id, token_id, idea_text, extra_notes, platform, target_date, status, generated_post_id, submitted_at, read_at'

// notifications
export const NOTIFICATION_COLUMNS =
  'id, agency_id, message, is_read, created_at, type, client_id, post_id, feedback_text, review_token'
