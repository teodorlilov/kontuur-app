export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          agency_logo: string | null
          created_at: string | null
          id: string
          mode: string | null
          name: string
          plan: string | null
          plan_client_limit: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          timezone: string | null
          trial_ends_at: string | null
        }
        Insert: {
          agency_logo?: string | null
          created_at?: string | null
          id?: string
          mode?: string | null
          name: string
          plan?: string | null
          plan_client_limit?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          agency_logo?: string | null
          created_at?: string | null
          id?: string
          mode?: string | null
          name?: string
          plan?: string | null
          plan_client_limit?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      analytics_reports: {
        Row: {
          ai_summary: string | null
          client_id: string | null
          created_at: string | null
          id: string
          metrics_json: Json | null
          period_end: string | null
          period_start: string | null
          platform: string | null
          report_type: string | null
        }
        Insert: {
          ai_summary?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          metrics_json?: Json | null
          period_end?: string | null
          period_start?: string | null
          platform?: string | null
          report_type?: string | null
        }
        Update: {
          ai_summary?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          metrics_json?: Json | null
          period_end?: string | null
          period_start?: string | null
          platform?: string | null
          report_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          avoid_topics: string | null
          best_time_json: Json | null
          best_time_updated_at: string | null
          client_id: string | null
          client_testimonial_voice: string | null
          content_pillars: string | null
          default_carousel_slides: number | null
          default_post_type: string | null
          id: string
          is_health_niche: boolean | null
          language_formality: string | null
          language_notes: string | null
          secondary_language: string | null
          source_strategy: Json
          target_audience: string | null
          tone: string | null
          weekly_mix_json: Json | null
        }
        Insert: {
          avoid_topics?: string | null
          best_time_json?: Json | null
          best_time_updated_at?: string | null
          client_id?: string | null
          client_testimonial_voice?: string | null
          content_pillars?: string | null
          default_carousel_slides?: number | null
          default_post_type?: string | null
          id?: string
          is_health_niche?: boolean | null
          language_formality?: string | null
          language_notes?: string | null
          secondary_language?: string | null
          source_strategy?: Json
          target_audience?: string | null
          tone?: string | null
          weekly_mix_json?: Json | null
        }
        Update: {
          avoid_topics?: string | null
          best_time_json?: Json | null
          best_time_updated_at?: string | null
          client_id?: string | null
          client_testimonial_voice?: string | null
          content_pillars?: string | null
          default_carousel_slides?: number | null
          default_post_type?: string | null
          id?: string
          is_health_niche?: boolean | null
          language_formality?: string | null
          language_notes?: string | null
          secondary_language?: string | null
          source_strategy?: Json
          target_audience?: string | null
          tone?: string | null
          weekly_mix_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ideas: {
        Row: {
          agency_id: string
          client_id: string
          extra_notes: string | null
          generated_post_id: string | null
          id: string
          idea_text: string
          platform: string | null
          read_at: string | null
          status: string
          submitted_at: string | null
          target_date: string | null
          token_id: string
        }
        Insert: {
          agency_id: string
          client_id: string
          extra_notes?: string | null
          generated_post_id?: string | null
          id?: string
          idea_text: string
          platform?: string | null
          read_at?: string | null
          status?: string
          submitted_at?: string | null
          target_date?: string | null
          token_id: string
        }
        Update: {
          agency_id?: string
          client_id?: string
          extra_notes?: string | null
          generated_post_id?: string | null
          id?: string
          idea_text?: string
          platform?: string | null
          read_at?: string | null
          status?: string
          submitted_at?: string | null
          target_date?: string | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ideas_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ideas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ideas_generated_post_id_fkey"
            columns: ["generated_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ideas_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "idea_form_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sources: {
        Row: {
          client_id: string
          config: Json
          created_at: string
          extracted_text: string | null
          file_path: string | null
          id: string
          is_active: boolean
          label: string
          last_fetch_error: string | null
          last_fetch_status: string | null
          last_fetched_at: string | null
          pillar_ids: Json
          source_summary: string | null
          source_summary_at: string | null
          type: string
          url: string
        }
        Insert: {
          client_id: string
          config?: Json
          created_at?: string
          extracted_text?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_fetch_error?: string | null
          last_fetch_status?: string | null
          last_fetched_at?: string | null
          pillar_ids?: Json
          source_summary?: string | null
          source_summary_at?: string | null
          type: string
          url: string
        }
        Update: {
          client_id?: string
          config?: Json
          created_at?: string
          extracted_text?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_fetch_error?: string | null
          last_fetch_status?: string | null
          last_fetched_at?: string | null
          pillar_ids?: Json
          source_summary?: string | null
          source_summary_at?: string | null
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string | null
          contact_email: string | null
          created_at: string | null
          id: string
          language: string | null
          name: string
          niche: string | null
          posts_per_week: number | null
          website_url: string | null
        }
        Insert: {
          agency_id?: string | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          name: string
          niche?: string | null
          posts_per_week?: number | null
          website_url?: string | null
        }
        Update: {
          agency_id?: string | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          name?: string
          niche?: string | null
          posts_per_week?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_runs: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          platform: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_themes: {
        Row: {
          id: string
          is_priority: boolean | null
          post_count: number | null
          priority_brief: string | null
          research_used: boolean | null
          run_id: string | null
          target_date: string | null
          theme_description: string | null
        }
        Insert: {
          id?: string
          is_priority?: boolean | null
          post_count?: number | null
          priority_brief?: string | null
          research_used?: boolean | null
          run_id?: string | null
          target_date?: string | null
          theme_description?: string | null
        }
        Update: {
          id?: string
          is_priority?: boolean | null
          post_count?: number | null
          priority_brief?: string | null
          research_used?: boolean | null
          run_id?: string | null
          target_date?: string | null
          theme_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_themes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_form_tokens: {
        Row: {
          agency_id: string
          client_id: string
          created_at: string | null
          id: string
          token: string
        }
        Insert: {
          agency_id: string
          client_id: string
          created_at?: string | null
          id?: string
          token: string
        }
        Update: {
          agency_id?: string
          client_id?: string
          created_at?: string | null
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_form_tokens_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_form_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_briefings: {
        Row: {
          action_nudge: string | null
          agency_id: string | null
          briefing_text: string | null
          coaching_points: Json | null
          created_at: string | null
          id: string
          platform_updates: string[] | null
          sources: string[] | null
          trending_topics: Json | null
          week_start: string | null
          weekly_tip: string | null
        }
        Insert: {
          action_nudge?: string | null
          agency_id?: string | null
          briefing_text?: string | null
          coaching_points?: Json | null
          created_at?: string | null
          id?: string
          platform_updates?: string[] | null
          sources?: string[] | null
          trending_topics?: Json | null
          week_start?: string | null
          weekly_tip?: string | null
        }
        Update: {
          action_nudge?: string | null
          agency_id?: string | null
          briefing_text?: string | null
          coaching_points?: Json | null
          created_at?: string | null
          id?: string
          platform_updates?: string[] | null
          sources?: string[] | null
          trending_topics?: Json | null
          week_start?: string | null
          weekly_tip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_briefings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      language_rules: {
        Row: {
          banned_anglicisms: Json | null
          banned_calques: Json | null
          formality_default: string | null
          formality_rules: Json | null
          id: string
          language: string
          language_instructions: string | null
          native_cta_phrases: Json | null
          opener_examples: Json | null
        }
        Insert: {
          banned_anglicisms?: Json | null
          banned_calques?: Json | null
          formality_default?: string | null
          formality_rules?: Json | null
          id?: string
          language: string
          language_instructions?: string | null
          native_cta_phrases?: Json | null
          opener_examples?: Json | null
        }
        Update: {
          banned_anglicisms?: Json | null
          banned_calques?: Json | null
          formality_default?: string | null
          formality_rules?: Json | null
          id?: string
          language?: string
          language_instructions?: string | null
          native_cta_phrases?: Json | null
          opener_examples?: Json | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          agency_id: string | null
          client_id: string | null
          created_at: string | null
          feedback_text: string | null
          id: string
          is_read: boolean | null
          message: string | null
          post_id: string | null
          review_token: string | null
          type: string | null
        }
        Insert: {
          agency_id?: string | null
          client_id?: string | null
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          post_id?: string | null
          review_token?: string | null
          type?: string | null
        }
        Update: {
          agency_id?: string | null
          client_id?: string | null
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          post_id?: string | null
          review_token?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_approval_tokens: {
        Row: {
          batch_id: string | null
          client_email: string | null
          client_note: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          post_id: string | null
          responded_at: string | null
          status: string | null
          token: string | null
        }
        Insert: {
          batch_id?: string | null
          client_email?: string | null
          client_note?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          post_id?: string | null
          responded_at?: string | null
          status?: string | null
          token?: string | null
        }
        Update: {
          batch_id?: string | null
          client_email?: string | null
          client_note?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          post_id?: string | null
          responded_at?: string | null
          status?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_approval_tokens_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_history: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          topic_summary: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          topic_summary?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          topic_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      post_images: {
        Row: {
          content_type: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          id: string
          position: number
          post_id: string
          public_url: string
          storage_path: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          position?: number
          post_id: string
          public_url: string
          storage_path: string
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          position?: number
          post_id?: string
          public_url?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_schedules: {
        Row: {
          auto_generate_day: string | null
          auto_generate_time: string | null
          client_id: string | null
          created_at: string | null
          frequency_type: string | null
          frequency_value: number | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          auto_generate_day?: string | null
          auto_generate_time?: string | null
          client_id?: string | null
          created_at?: string | null
          frequency_type?: string | null
          frequency_value?: number | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          auto_generate_day?: string | null
          auto_generate_time?: string | null
          client_id?: string | null
          created_at?: string | null
          frequency_type?: string | null
          frequency_value?: number | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "posting_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          client_id: string | null
          created_at: string | null
          id: string
          ig_creation_id: string | null
          ig_media_id: string | null
          image_url: string | null
          pillar: string | null
          platform: string | null
          post_type: string | null
          priority: boolean | null
          publish_attempts: number | null
          publish_error: string | null
          published_at: string | null
          quality_score_avg: number | null
          rewrite_count: number | null
          scheduled_at: string | null
          slides_json: Json | null
          source_excerpt: string | null
          source_title: string | null
          source_type: string | null
          source_url: string | null
          status: string | null
          validation_json: Json | null
          was_rewritten: boolean | null
        }
        Insert: {
          caption?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          ig_creation_id?: string | null
          ig_media_id?: string | null
          image_url?: string | null
          pillar?: string | null
          platform?: string | null
          post_type?: string | null
          priority?: boolean | null
          publish_attempts?: number | null
          publish_error?: string | null
          published_at?: string | null
          quality_score_avg?: number | null
          rewrite_count?: number | null
          scheduled_at?: string | null
          slides_json?: Json | null
          source_excerpt?: string | null
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          validation_json?: Json | null
          was_rewritten?: boolean | null
        }
        Update: {
          caption?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          ig_creation_id?: string | null
          ig_media_id?: string | null
          image_url?: string | null
          pillar?: string | null
          platform?: string | null
          post_type?: string | null
          priority?: boolean | null
          publish_attempts?: number | null
          publish_error?: string | null
          published_at?: string | null
          quality_score_avg?: number | null
          rewrite_count?: number | null
          scheduled_at?: string | null
          slides_json?: Json | null
          source_excerpt?: string | null
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          validation_json?: Json | null
          was_rewritten?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          client_id: string | null
          created_at: string | null
          id: string
          platform: string | null
          token_expires_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string | null
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          agency_id: string | null
          created_at: string | null
          email: string
          id: string
          role: string | null
        }
        Insert: {
          agency_id?: string | null
          created_at?: string | null
          email: string
          id: string
          role?: string | null
        }
        Update: {
          agency_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      client_post_stats: {
        Args: { p_agency_id: string }
        Returns: {
          client_id: string
          last_generated_at: string
          published_count: number
          total_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
