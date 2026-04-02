export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Tables: {
      agencies: {
        Row: {
          id: string
          name: string
          plan: string
          mode: string
          agency_logo: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          trial_ends_at: string
          plan_client_limit: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          plan?: string
          mode?: string
          agency_logo?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_ends_at?: string
          plan_client_limit?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          plan?: string
          mode?: string
          agency_logo?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_ends_at?: string
          plan_client_limit?: number
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          agency_id: string
          email: string
          role: string
          created_at: string
        }
        Insert: {
          id: string
          agency_id: string
          email: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          email?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          agency_id: string
          name: string
          niche: string | null
          posts_per_week: number
          language: string
          website_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          niche?: string | null
          posts_per_week?: number
          language?: string
          website_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          niche?: string | null
          posts_per_week?: number
          language?: string
          website_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          id: string
          client_id: string
          tone: string | null
          target_audience: string | null
          content_pillars: string | null
          avoid_topics: string | null
          client_testimonial_voice: string | null
          default_post_type: string
          default_carousel_slides: number
          weekly_mix_json: Json
          language_formality: string
          secondary_language: string | null
          is_health_niche: boolean
          best_time_json: Json | null
          best_time_updated_at: string | null
          source_strategy: Json
        }
        Insert: {
          id?: string
          client_id: string
          tone?: string | null
          target_audience?: string | null
          content_pillars?: string | null
          avoid_topics?: string | null
          client_testimonial_voice?: string | null
          default_post_type?: string
          default_carousel_slides?: number
          weekly_mix_json?: Json
          language_formality?: string
          secondary_language?: string | null
          is_health_niche?: boolean
          best_time_json?: Json | null
          best_time_updated_at?: string | null
          source_strategy?: Json
        }
        Update: {
          id?: string
          client_id?: string
          tone?: string | null
          target_audience?: string | null
          content_pillars?: string | null
          avoid_topics?: string | null
          client_testimonial_voice?: string | null
          default_post_type?: string
          default_carousel_slides?: number
          weekly_mix_json?: Json
          language_formality?: string
          secondary_language?: string | null
          is_health_niche?: boolean
          best_time_json?: Json | null
          best_time_updated_at?: string | null
          source_strategy?: Json
        }
        Relationships: []
      }
      posting_schedules: {
        Row: {
          id: string
          client_id: string
          is_active: boolean
          frequency_type: string
          frequency_value: number
          auto_generate_day: string
          auto_generate_time: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          is_active?: boolean
          frequency_type?: string
          frequency_value?: number
          auto_generate_day?: string
          auto_generate_time?: string
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          is_active?: boolean
          frequency_type?: string
          frequency_value?: number
          auto_generate_day?: string
          auto_generate_time?: string
          created_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          id: string
          client_id: string
          caption: string | null
          platform: string | null
          post_type: string
          slides_json: Json | null
          carousel_quality_json: Json | null
          status: string
          priority: boolean
          scheduled_at: string | null
          published_at: string | null
          quality_score_avg: number | null
          was_rewritten: boolean
          rewrite_count: number
          source_url: string | null
          source_title: string | null
          source_type: string | null
          pillar: string | null
          source_excerpt: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          caption?: string | null
          platform?: string | null
          post_type?: string
          slides_json?: Json | null
          carousel_quality_json?: Json | null
          status?: string
          priority?: boolean
          scheduled_at?: string | null
          published_at?: string | null
          quality_score_avg?: number | null
          was_rewritten?: boolean
          rewrite_count?: number
          source_url?: string | null
          source_title?: string | null
          source_type?: string | null
          pillar?: string | null
          source_excerpt?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          caption?: string | null
          platform?: string | null
          post_type?: string
          slides_json?: Json | null
          carousel_quality_json?: Json | null
          status?: string
          priority?: boolean
          scheduled_at?: string | null
          published_at?: string | null
          quality_score_avg?: number | null
          was_rewritten?: boolean
          rewrite_count?: number
          source_url?: string | null
          source_title?: string | null
          source_type?: string | null
          pillar?: string | null
          source_excerpt?: string | null
          created_at?: string
        }
        Relationships: []
      }
      post_history: {
        Row: {
          id: string
          client_id: string
          topic_summary: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          topic_summary?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          topic_summary?: string | null
          created_at?: string
        }
        Relationships: []
      }
      generation_runs: {
        Row: {
          id: string
          client_id: string
          platform: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          platform?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          platform?: string | null
          created_at?: string
        }
        Relationships: []
      }
      generation_themes: {
        Row: {
          id: string
          run_id: string
          theme_description: string | null
          post_count: number
          is_priority: boolean
          priority_brief: string | null
          target_date: string | null
          research_used: boolean
        }
        Insert: {
          id?: string
          run_id: string
          theme_description?: string | null
          post_count?: number
          is_priority?: boolean
          priority_brief?: string | null
          target_date?: string | null
          research_used?: boolean
        }
        Update: {
          id?: string
          run_id?: string
          theme_description?: string | null
          post_count?: number
          is_priority?: boolean
          priority_brief?: string | null
          target_date?: string | null
          research_used?: boolean
        }
        Relationships: []
      }
      post_approval_tokens: {
        Row: {
          id: string
          post_id: string
          token: string
          client_email: string | null
          batch_id: string | null
          status: string
          client_note: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          token?: string
          client_email?: string | null
          batch_id?: string | null
          status?: string
          client_note?: string | null
          expires_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          token?: string
          client_email?: string | null
          batch_id?: string | null
          status?: string
          client_note?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          id: string
          client_id: string
          platform: string | null
          account_id: string | null
          account_name: string | null
          access_token: string | null
          token_expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          platform?: string | null
          account_id?: string | null
          account_name?: string | null
          access_token?: string | null
          token_expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          platform?: string | null
          account_id?: string | null
          account_name?: string | null
          access_token?: string | null
          token_expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      analytics_reports: {
        Row: {
          id: string
          client_id: string
          platform: string | null
          period_start: string | null
          period_end: string | null
          metrics_json: Json | null
          ai_summary: string | null
          report_type: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          platform?: string | null
          period_start?: string | null
          period_end?: string | null
          metrics_json?: Json | null
          ai_summary?: string | null
          report_type?: string
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          platform?: string | null
          period_start?: string | null
          period_end?: string | null
          metrics_json?: Json | null
          ai_summary?: string | null
          report_type?: string
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          agency_id: string
          message: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          message?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          message?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      language_rules: {
        Row: {
          id: string
          language: string
          banned_anglicisms: Json | null
          banned_calques: Json | null
          native_cta_phrases: Json | null
          formality_default: string
        }
        Insert: {
          id?: string
          language: string
          banned_anglicisms?: Json | null
          banned_calques?: Json | null
          native_cta_phrases?: Json | null
          formality_default?: string
        }
        Update: {
          id?: string
          language?: string
          banned_anglicisms?: Json | null
          banned_calques?: Json | null
          native_cta_phrases?: Json | null
          formality_default?: string
        }
        Relationships: []
      }
      client_sources: {
        Row: {
          id: string
          client_id: string
          type: string
          label: string
          url: string
          is_active: boolean
          last_fetched_at: string | null
          last_fetch_status: string | null
          last_fetch_error: string | null
          config: Json
          file_path: string | null
          extracted_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          type: string
          label: string
          url: string
          is_active?: boolean
          last_fetched_at?: string | null
          last_fetch_status?: string | null
          last_fetch_error?: string | null
          config?: Json
          file_path?: string | null
          extracted_text?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          type?: string
          label?: string
          url?: string
          is_active?: boolean
          last_fetched_at?: string | null
          last_fetch_status?: string | null
          last_fetch_error?: string | null
          config?: Json
          file_path?: string | null
          extracted_text?: string | null
          created_at?: string
        }
        Relationships: []
      }
      intelligence_briefings: {
        Row: {
          id: string
          agency_id: string
          briefing_text: string | null
          platform_updates: string[] | null
          trending_topics: Json | null
          action_nudge: string | null
          weekly_tip: string | null
          sources: string[] | null
          week_start: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          briefing_text?: string | null
          platform_updates?: string[] | null
          trending_topics?: Json | null
          action_nudge?: string | null
          weekly_tip?: string | null
          sources?: string[] | null
          week_start?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          briefing_text?: string | null
          platform_updates?: string[] | null
          trending_topics?: Json | null
          action_nudge?: string | null
          weekly_tip?: string | null
          sources?: string[] | null
          week_start?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
  }
}
