export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      _legacy_company_whatsapp: {
        Row: {
          company_id: string
          created_at: string
          delivery_format: string
          id: string
          owner_phone: string | null
          status: string
          user_id: string | null
          welcome_sent_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_format?: string
          id?: string
          owner_phone?: string | null
          status?: string
          user_id?: string | null
          welcome_sent_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_format?: string
          id?: string
          owner_phone?: string | null
          status?: string
          user_id?: string | null
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_whatsapp_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          id: string
          ip: unknown
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email: string
          actor_id: string
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_cost_events: {
        Row: {
          attempt_id: string
          company_id: string | null
          created_at: string
          estimate_id: string | null
          id: string
          model: string | null
          operation_type: string
          project_id: string | null
          provider: string
          real_cost_usd: number | null
          units: number | null
        }
        Insert: {
          attempt_id: string
          company_id?: string | null
          created_at?: string
          estimate_id?: string | null
          id?: string
          model?: string | null
          operation_type: string
          project_id?: string | null
          provider: string
          real_cost_usd?: number | null
          units?: number | null
        }
        Update: {
          attempt_id?: string
          company_id?: string | null
          created_at?: string
          estimate_id?: string | null
          id?: string
          model?: string | null
          operation_type?: string
          project_id?: string | null
          provider?: string
          real_cost_usd?: number | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_votes: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          is_upvoted: boolean
          message_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          is_upvoted: boolean
          message_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_upvoted?: boolean
          message_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_votes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_votes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          client_id: string | null
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          parts: Json
          role: string
        }
        Insert: {
          attachments?: Json | null
          client_id?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          parts?: Json
          role: string
        }
        Update: {
          attachments?: Json | null
          client_id?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          parts?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          preferred_language: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          ai_model_override: string | null
          auto_topup_enabled: boolean
          auto_topup_in_flight_until: string | null
          auto_topup_last_charge_attempt_at: string | null
          auto_topup_last_failed_at: string | null
          auto_topup_pack_credits: number | null
          auto_topup_pack_index: number | null
          auto_topup_pack_price_cents: number | null
          auto_topup_threshold_credits: number | null
          brand_primary_color: string | null
          byok_enabled: boolean
          byok_key_last4: string | null
          byok_openrouter_key: string | null
          city: string | null
          created_at: string
          credit_balance: number
          currency_code: string
          custom_domain: string | null
          default_estimate_language: string | null
          default_payment_terms: string | null
          default_tax_rate: number | null
          default_validity_days: number | null
          default_warranty_terms: string | null
          demo_estimate_quota: number | null
          digital_signature_enabled: boolean
          email: string | null
          email_delivery_enabled: boolean
          estimate_template_closer: string | null
          estimate_template_greeting: string | null
          estimate_template_opener: string | null
          estimate_template_signature: string | null
          estimate_template_style: string
          estimate_terms_enabled: boolean
          estimate_terms_text: string | null
          id: string
          industries: string[]
          industry: string | null
          insurance_info: string | null
          license_number: string | null
          logo_url: string | null
          name: string
          notify_on_accept: boolean | null
          notify_on_decline: boolean | null
          notify_on_view: boolean | null
          owner_name: string | null
          phone: string | null
          slug: string | null
          sms_delivery_enabled: boolean
          state: string | null
          stripe_account_display_name: string | null
          stripe_account_email: string | null
          stripe_account_id: string | null
          stripe_connect_status: string | null
          stripe_connected_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subdomain: string | null
          tax_config: Json | null
          theme_preference: string | null
          tier: string
          tier_cancelled_at: string | null
          tier_renews_at: string | null
          tier_trial_ends_at: string | null
          trade_suggestion_dismissed_at: string | null
          updated_at: string
          user_id: string
          website: string | null
          xphere_account_id: string | null
          xphere_contact_id: string | null
          xphere_opportunity_id: string | null
          xphere_sync_error: string | null
          xphere_synced_at: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          ai_model_override?: string | null
          auto_topup_enabled?: boolean
          auto_topup_in_flight_until?: string | null
          auto_topup_last_charge_attempt_at?: string | null
          auto_topup_last_failed_at?: string | null
          auto_topup_pack_credits?: number | null
          auto_topup_pack_index?: number | null
          auto_topup_pack_price_cents?: number | null
          auto_topup_threshold_credits?: number | null
          brand_primary_color?: string | null
          byok_enabled?: boolean
          byok_key_last4?: string | null
          byok_openrouter_key?: string | null
          city?: string | null
          created_at?: string
          credit_balance?: number
          currency_code?: string
          custom_domain?: string | null
          default_estimate_language?: string | null
          default_payment_terms?: string | null
          default_tax_rate?: number | null
          default_validity_days?: number | null
          default_warranty_terms?: string | null
          demo_estimate_quota?: number | null
          digital_signature_enabled?: boolean
          email?: string | null
          email_delivery_enabled?: boolean
          estimate_template_closer?: string | null
          estimate_template_greeting?: string | null
          estimate_template_opener?: string | null
          estimate_template_signature?: string | null
          estimate_template_style?: string
          estimate_terms_enabled?: boolean
          estimate_terms_text?: string | null
          id?: string
          industries?: string[]
          industry?: string | null
          insurance_info?: string | null
          license_number?: string | null
          logo_url?: string | null
          name: string
          notify_on_accept?: boolean | null
          notify_on_decline?: boolean | null
          notify_on_view?: boolean | null
          owner_name?: string | null
          phone?: string | null
          slug?: string | null
          sms_delivery_enabled?: boolean
          state?: string | null
          stripe_account_display_name?: string | null
          stripe_account_email?: string | null
          stripe_account_id?: string | null
          stripe_connect_status?: string | null
          stripe_connected_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subdomain?: string | null
          tax_config?: Json | null
          theme_preference?: string | null
          tier?: string
          tier_cancelled_at?: string | null
          tier_renews_at?: string | null
          tier_trial_ends_at?: string | null
          trade_suggestion_dismissed_at?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          xphere_account_id?: string | null
          xphere_contact_id?: string | null
          xphere_opportunity_id?: string | null
          xphere_sync_error?: string | null
          xphere_synced_at?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          ai_model_override?: string | null
          auto_topup_enabled?: boolean
          auto_topup_in_flight_until?: string | null
          auto_topup_last_charge_attempt_at?: string | null
          auto_topup_last_failed_at?: string | null
          auto_topup_pack_credits?: number | null
          auto_topup_pack_index?: number | null
          auto_topup_pack_price_cents?: number | null
          auto_topup_threshold_credits?: number | null
          brand_primary_color?: string | null
          byok_enabled?: boolean
          byok_key_last4?: string | null
          byok_openrouter_key?: string | null
          city?: string | null
          created_at?: string
          credit_balance?: number
          currency_code?: string
          custom_domain?: string | null
          default_estimate_language?: string | null
          default_payment_terms?: string | null
          default_tax_rate?: number | null
          default_validity_days?: number | null
          default_warranty_terms?: string | null
          demo_estimate_quota?: number | null
          digital_signature_enabled?: boolean
          email?: string | null
          email_delivery_enabled?: boolean
          estimate_template_closer?: string | null
          estimate_template_greeting?: string | null
          estimate_template_opener?: string | null
          estimate_template_signature?: string | null
          estimate_template_style?: string
          estimate_terms_enabled?: boolean
          estimate_terms_text?: string | null
          id?: string
          industries?: string[]
          industry?: string | null
          insurance_info?: string | null
          license_number?: string | null
          logo_url?: string | null
          name?: string
          notify_on_accept?: boolean | null
          notify_on_decline?: boolean | null
          notify_on_view?: boolean | null
          owner_name?: string | null
          phone?: string | null
          slug?: string | null
          sms_delivery_enabled?: boolean
          state?: string | null
          stripe_account_display_name?: string | null
          stripe_account_email?: string | null
          stripe_account_id?: string | null
          stripe_connect_status?: string | null
          stripe_connected_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subdomain?: string | null
          tax_config?: Json | null
          theme_preference?: string | null
          tier?: string
          tier_cancelled_at?: string | null
          tier_renews_at?: string | null
          tier_trial_ends_at?: string | null
          trade_suggestion_dismissed_at?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          xphere_account_id?: string | null
          xphere_contact_id?: string | null
          xphere_opportunity_id?: string | null
          xphere_sync_error?: string | null
          xphere_synced_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          company_id: string
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          role: string
          status?: string
          token: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          display_name: string | null
          email: string | null
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_price_book: {
        Row: {
          area_sizes: Json | null
          base_price: number | null
          company_id: string
          created_at: string
          currency_code: string
          folder_id: string | null
          id: string
          image_url: string | null
          minimum_price: number | null
          name: string
          notes: string | null
          price_per_unit: number | null
          pricing_type: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          area_sizes?: Json | null
          base_price?: number | null
          company_id: string
          created_at?: string
          currency_code?: string
          folder_id?: string | null
          id?: string
          image_url?: string | null
          minimum_price?: number | null
          name: string
          notes?: string | null
          price_per_unit?: number | null
          pricing_type?: string
          unit?: string | null
          unit_price?: number
        }
        Update: {
          area_sizes?: Json | null
          base_price?: number | null
          company_id?: string
          created_at?: string
          currency_code?: string
          folder_id?: string | null
          id?: string
          image_url?: string | null
          minimum_price?: number | null
          name?: string
          notes?: string | null
          price_per_unit?: number | null
          pricing_type?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_price_book_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_price_book_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "price_book_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          balance_after: number
          company_id: string
          created_at: string
          delta_credits: number
          id: string
          idempotency_key: string | null
          markup: number | null
          operation_type: string | null
          real_cost_usd: number | null
          reason: string
          ref_id: string | null
        }
        Insert: {
          balance_after: number
          company_id: string
          created_at?: string
          delta_credits: number
          id?: string
          idempotency_key?: string | null
          markup?: number | null
          operation_type?: string | null
          real_cost_usd?: number | null
          reason: string
          ref_id?: string | null
        }
        Update: {
          balance_after?: number
          company_id?: string
          created_at?: string
          delta_credits?: number
          id?: string
          idempotency_key?: string | null
          markup?: number | null
          operation_type?: string | null
          real_cost_usd?: number | null
          reason?: string
          ref_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_config: {
        Row: {
          company_id: string | null
          created_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      estimate_activity: {
        Row: {
          company_id: string
          created_at: string
          estimate_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          project_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          estimate_id?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          project_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          estimate_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_activity_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_deliveries: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          error_message: string | null
          estimate_id: string
          format: string | null
          id: string
          provider: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          error_message?: string | null
          estimate_id: string
          format?: string | null
          id?: string
          provider: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          error_message?: string | null
          estimate_id?: string
          format?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_deliveries_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_items: {
        Row: {
          company_id: string
          cost: number | null
          description: string
          discount: number
          id: string
          markup_pct: number | null
          price_source: string | null
          quantity: number
          section_id: string
          sort_order: number
          tax_category: string | null
          taxable: boolean
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          company_id: string
          cost?: number | null
          description: string
          discount?: number
          id?: string
          markup_pct?: number | null
          price_source?: string | null
          quantity?: number
          section_id: string
          sort_order?: number
          tax_category?: string | null
          taxable?: boolean
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          company_id?: string
          cost?: number | null
          description?: string
          discount?: number
          id?: string
          markup_pct?: number | null
          price_source?: string | null
          quantity?: number
          section_id?: string
          sort_order?: number
          tax_category?: string | null
          taxable?: boolean
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "estimate_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_photos: {
        Row: {
          company_id: string
          created_at: string
          estimate_id: string
          id: string
          photo_id: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          estimate_id: string
          id?: string
          photo_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          estimate_id?: string
          id?: string
          photo_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_photos_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_sections: {
        Row: {
          company_id: string
          estimate_id: string
          id: string
          sort_order: number
          subtotal: number | null
          title: string
        }
        Insert: {
          company_id: string
          estimate_id: string
          id?: string
          sort_order?: number
          subtotal?: number | null
          title: string
        }
        Update: {
          company_id?: string
          estimate_id?: string
          id?: string
          sort_order?: number
          subtotal?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_sections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_sections_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_signatures: {
        Row: {
          company_id: string
          estimate_id: string
          id: string
          ip_address: unknown
          signature_data: string
          signed_at: string
          signer_email: string | null
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          company_id: string
          estimate_id: string
          id?: string
          ip_address?: unknown
          signature_data: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          company_id?: string
          estimate_id?: string
          id?: string
          ip_address?: unknown
          signature_data?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_signatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_signatures_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          balance_due: number | null
          client_response: string | null
          company_id: string
          consolidated_at: string | null
          consolidated_by: string | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          deposit_type: string
          deposit_value: number | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          estimate_date: string | null
          estimate_number: string | null
          estimate_seq: number
          id: string
          is_current: boolean
          language: string
          notes: string | null
          paid_at: string | null
          payment_amount_cents: number | null
          payment_status: string
          payment_terms: string | null
          presentation_settings: Json | null
          project_id: string
          public_slug_token: string | null
          responded_at: string | null
          sent_at: string | null
          share_expires_at: string | null
          share_token: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number | null
          summary: string | null
          tax_amount: number | null
          tax_rate: number | null
          timeline: string | null
          total: number | null
          updated_at: string
          version: number
          viewed_at: string | null
          warranty_terms: string | null
          workflow_status: string
        }
        Insert: {
          balance_due?: number | null
          client_response?: string | null
          company_id: string
          consolidated_at?: string | null
          consolidated_by?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          deposit_type?: string
          deposit_value?: number | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          estimate_date?: string | null
          estimate_number?: string | null
          estimate_seq: number
          id?: string
          is_current?: boolean
          language?: string
          notes?: string | null
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_status?: string
          payment_terms?: string | null
          presentation_settings?: Json | null
          project_id: string
          public_slug_token?: string | null
          responded_at?: string | null
          sent_at?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number | null
          summary?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          timeline?: string | null
          total?: number | null
          updated_at?: string
          version?: number
          viewed_at?: string | null
          warranty_terms?: string | null
          workflow_status?: string
        }
        Update: {
          balance_due?: number | null
          client_response?: string | null
          company_id?: string
          consolidated_at?: string | null
          consolidated_by?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          deposit_type?: string
          deposit_value?: number | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          estimate_date?: string | null
          estimate_number?: string | null
          estimate_seq?: number
          id?: string
          is_current?: boolean
          language?: string
          notes?: string | null
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_status?: string
          payment_terms?: string | null
          presentation_settings?: Json | null
          project_id?: string
          public_slug_token?: string | null
          responded_at?: string | null
          sent_at?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number | null
          summary?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          timeline?: string | null
          total?: number | null
          updated_at?: string
          version?: number
          viewed_at?: string | null
          warranty_terms?: string | null
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          currency_code: string
          description: string | null
          estimate_id: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          kind: string
          paid_at: string | null
          project_name: string | null
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          currency_code: string
          description?: string | null
          estimate_id: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          kind: string
          paid_at?: string | null
          project_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          currency_code?: string
          description?: string | null
          estimate_id?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          kind?: string
          paid_at?: string | null
          project_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_dispatch_ownership: {
        Row: {
          company_id: string
          created_at: string
          event_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_dispatch_ownership_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          body: string
          company_id: string | null
          created_at: string
          embedding: string | null
          id: string
          industry_id: string | null
          scope: string
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          company_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          industry_id?: string | null
          scope: string
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          industry_id?: string | null
          scope?: string
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_pages: {
        Row: {
          content: string
          effective_date: string | null
          id: string
          title: string
          updated_at: string
          updated_by_email: string | null
        }
        Insert: {
          content?: string
          effective_date?: string | null
          id: string
          title: string
          updated_at?: string
          updated_by_email?: string | null
        }
        Update: {
          content?: string
          effective_date?: string | null
          id?: string
          title?: string
          updated_at?: string
          updated_by_email?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          categories: Json
          email_digest_enabled: boolean
          push_subscription: Json | null
          sms_opt_in_at: string | null
          sms_opt_in_consent_text: string | null
          updated_at: string
          user_id: string
          whatsapp_opt_in_at: string | null
        }
        Insert: {
          categories?: Json
          email_digest_enabled?: boolean
          push_subscription?: Json | null
          sms_opt_in_at?: string | null
          sms_opt_in_consent_text?: string | null
          updated_at?: string
          user_id: string
          whatsapp_opt_in_at?: string | null
        }
        Update: {
          categories?: Json
          email_digest_enabled?: boolean
          push_subscription?: Json | null
          sms_opt_in_at?: string | null
          sms_opt_in_consent_text?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_opt_in_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          company_id: string
          created_at: string
          event_type: string
          expires_at: string | null
          id: string
          link_url: string | null
          metadata: Json
          pinned: boolean
          read_at: string | null
          resource_id: string | null
          resource_type: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          event_type: string
          expires_at?: string | null
          id?: string
          link_url?: string | null
          metadata?: Json
          pinned?: boolean
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          event_type?: string
          expires_at?: string | null
          id?: string
          link_url?: string | null
          metadata?: Json
          pinned?: boolean
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_access_tokens: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          expires_at: string
          revoked_at: string | null
          scope: string
          token_hash: string
          user_id: string
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          expires_at: string
          revoked_at?: string | null
          scope: string
          token_hash: string
          user_id: string
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_access_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "oauth_access_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          company_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          redirect_uri: string
          scope: string
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          company_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          redirect_uri: string
          scope: string
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          code_hash?: string
          company_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorization_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "oauth_authorization_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          created_at: string
          grant_types: string[]
          id: string
          redirect_uris: string[]
          response_types: string[]
          token_endpoint_auth_method: string
        }
        Insert: {
          client_id: string
          client_name: string
          created_at?: string
          grant_types: string[]
          id?: string
          redirect_uris: string[]
          response_types: string[]
          token_endpoint_auth_method?: string
        }
        Update: {
          client_id?: string
          client_name?: string
          created_at?: string
          grant_types?: string[]
          id?: string
          redirect_uris?: string[]
          response_types?: string[]
          token_endpoint_auth_method?: string
        }
        Relationships: []
      }
      oauth_refresh_tokens: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          expires_at: string
          revoked_at: string | null
          scope: string
          token_hash: string
          user_id: string
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          expires_at: string
          revoked_at?: string | null
          scope: string
          token_hash: string
          user_id: string
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "oauth_refresh_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          ai_description: string | null
          caption: string | null
          company_id: string
          created_at: string
          id: string
          project_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          ai_description?: string | null
          caption?: string | null
          company_id: string
          created_at?: string
          id?: string
          project_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          ai_description?: string | null
          caption?: string | null
          company_id?: string
          created_at?: string
          id?: string
          project_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_events: {
        Row: {
          attempt_id: string
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          estimate_id: string | null
          id: string
          input_type: string
          project_id: string | null
          provider: string | null
          retry_count: number
          status: string
          step: string
          user_id: string | null
        }
        Insert: {
          attempt_id: string
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          estimate_id?: string | null
          id?: string
          input_type: string
          project_id?: string | null
          provider?: string | null
          retry_count?: number
          status: string
          step: string
          user_id?: string | null
        }
        Update: {
          attempt_id?: string
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          estimate_id?: string | null
          id?: string
          input_type?: string
          project_id?: string | null
          provider?: string | null
          retry_count?: number
          status?: string
          step?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_branding: {
        Row: {
          app_name: string
          canonical_base_url: string | null
          email_from_name: string | null
          favicon_url: string | null
          id: number
          landing_content: Json | null
          logo_url: string | null
          meta_description: string | null
          og_image_url: string | null
          primary_color: string | null
          site_title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_name: string
          canonical_base_url?: string | null
          email_from_name?: string | null
          favicon_url?: string | null
          id?: number
          landing_content?: Json | null
          logo_url?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          primary_color?: string | null
          site_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_name?: string
          canonical_base_url?: string | null
          email_from_name?: string | null
          favicon_url?: string | null
          id?: number
          landing_content?: Json | null
          logo_url?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          primary_color?: string | null
          site_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_integrations: {
        Row: {
          auth_tag: string | null
          ciphertext: string | null
          iv: string | null
          metadata: Json | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_tag?: string | null
          ciphertext?: string | null
          iv?: string | null
          metadata?: Json | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_tag?: string | null
          ciphertext?: string | null
          iv?: string | null
          metadata?: Json | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      price_book_folders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_book_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      price_book_imports: {
        Row: {
          actor_id: string
          company_id: string
          created_at: string
          id: string
          inserted_folder_ids: string[]
          inserted_item_ids: string[]
          prev_state: Json
          summary: Json
          updated_item_ids: string[]
        }
        Insert: {
          actor_id: string
          company_id: string
          created_at?: string
          id?: string
          inserted_folder_ids?: string[]
          inserted_item_ids?: string[]
          prev_state?: Json
          summary?: Json
          updated_item_ids?: string[]
        }
        Update: {
          actor_id?: string
          company_id?: string
          created_at?: string
          id?: string
          inserted_folder_ids?: string[]
          inserted_item_ids?: string[]
          prev_state?: Json
          summary?: Json
          updated_item_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "price_book_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      price_book_item_options: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          item_id: string
          max_quantity: number | null
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          item_id: string
          max_quantity?: number | null
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          max_quantity?: number | null
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_book_item_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_book_item_options_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "company_price_book"
            referencedColumns: ["id"]
          },
        ]
      }
      price_research_cache: {
        Row: {
          company_id: string
          confidence: number | null
          created_at: string
          currency_code: string
          expires_at: string
          id: string
          normalized_name: string
          region: string
          source: string | null
          unit_price: number
        }
        Insert: {
          company_id: string
          confidence?: number | null
          created_at?: string
          currency_code?: string
          expires_at: string
          id?: string
          normalized_name: string
          region: string
          source?: string | null
          unit_price: number
        }
        Update: {
          company_id?: string
          confidence?: number | null
          created_at?: string
          currency_code?: string
          expires_at?: string
          id?: string
          normalized_name?: string
          region?: string
          source?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_research_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_stripe_events: {
        Row: {
          created_at: string
          event_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          client_id: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          input_mode: string | null
          name: string
          needs_details: Json | null
          project_type: string | null
          status: string
          target_budget: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_mode?: string | null
          name: string
          needs_details?: Json | null
          project_type?: string | null
          status?: string
          target_budget?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_mode?: string | null
          name?: string
          needs_details?: Json | null
          project_type?: string | null
          status?: string
          target_budget?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          company_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          project_id: string
          storage_path: string | null
          transcript: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          project_id: string
          storage_path?: string | null
          transcript?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          project_id?: string
          storage_path?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          created_at: string | null
          id: number
          source_language: string
          source_text: string
          target_language: string
          translated_text: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          source_language?: string
          source_text: string
          target_language: string
          translated_text: string
        }
        Update: {
          created_at?: string | null
          id?: number
          source_language?: string
          source_text?: string
          target_language?: string
          translated_text?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          units: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          units?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_authorized_senders: {
        Row: {
          company_id: string
          config_id: string
          created_at: string
          created_by_admin: boolean | null
          id: string
          phone_e164: string
          source_row_id: string | null
          status: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          created_by_admin?: boolean | null
          id?: string
          phone_e164: string
          source_row_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          created_by_admin?: boolean | null
          id?: string
          phone_e164?: string
          source_row_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_authorized_senders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_authorized_senders_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_company_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_company_configs: {
        Row: {
          company_id: string
          created_at: string
          delivery_format: string
          id: string
          review_reason: string | null
          status: string
          updated_at: string
          welcome_sent_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_format?: string
          id?: string
          review_reason?: string | null
          status?: string
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_format?: string
          id?: string
          review_reason?: string | null
          status?: string
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_company_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          client_id: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          owner_phone: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          owner_phone?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          owner_phone?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          company_id: string
          conversation_id: string
          created_at: string
          direction: string
          error_message: string | null
          id: string
          media_url: string | null
          msg_type: string
          status: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          direction: string
          error_message?: string | null
          id?: string
          media_url?: string | null
          msg_type?: string
          status?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          media_url?: string | null
          msg_type?: string
          status?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notification_templates: {
        Row: {
          created_at: string
          created_by: string | null
          event_category: string | null
          event_type: string | null
          id: string
          language_code: string
          meta_template_id: string | null
          rejection_reason: string | null
          status: string
          template_name: string
          updated_at: string
          variables_schema: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_category?: string | null
          event_type?: string | null
          id?: string
          language_code?: string
          meta_template_id?: string | null
          rejection_reason?: string | null
          status?: string
          template_name: string
          updated_at?: string
          variables_schema?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_category?: string | null
          event_type?: string | null
          id?: string
          language_code?: string
          meta_template_id?: string | null
          rejection_reason?: string | null
          status?: string
          template_name?: string
          updated_at?: string
          variables_schema?: Json
        }
        Relationships: []
      }
      whatsapp_processed_messages: {
        Row: {
          company_id: string
          message_id: string
          processed_at: string
        }
        Insert: {
          company_id: string
          message_id: string
          processed_at?: string
        }
        Update: {
          company_id?: string
          message_id?: string
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_processed_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          company_id: string
          created_at: string
          draft_estimate_id: string | null
          draft_project_id: string | null
          expires_at: string
          id: string
          phone_number: string
          state: string
        }
        Insert: {
          company_id: string
          created_at?: string
          draft_estimate_id?: string | null
          draft_project_id?: string | null
          expires_at: string
          id?: string
          phone_number: string
          state?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          draft_estimate_id?: string | null
          draft_project_id?: string | null
          expires_at?: string
          id?: string
          phone_number?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sessions_draft_estimate_id_fkey"
            columns: ["draft_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sessions_draft_project_id_fkey"
            columns: ["draft_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pipeline_attempts: {
        Row: {
          attempt_id: string | null
          company_id: string | null
          estimate_id: string | null
          event_count: number | null
          first_at: string | null
          has_retry: boolean | null
          input_type: string | null
          last_at: string | null
          max_retry_count: number | null
          project_id: string | null
          step_reached: string | null
          terminal_status: string | null
          total_duration_ms: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_autotopup_lock: {
        Args: { p_company_id: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      apply_credit_ledger_entry: {
        Args: {
          p_company_id: string
          p_delta_credits: number
          p_idempotency_key?: string
          p_markup?: number
          p_operation_type?: string
          p_real_cost_usd?: number
          p_reason: string
          p_ref_id?: string
        }
        Returns: {
          applied: boolean
          balance_after: number
        }[]
      }
      cleanup_orphan_draft_projects: {
        Args: never
        Returns: {
          deleted_count: number
        }[]
      }
      get_platform_user_count: { Args: never; Returns: number }
      is_demo_user: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      match_knowledge_entries: {
        Args: {
          match_company: string
          match_count?: number
          match_industries: string[]
          query_embedding: string
        }
        Returns: {
          body: string
          id: string
          scope: string
          similarity: number
          source: string
          title: string
        }[]
      }
      release_autotopup_lock: {
        Args: { p_company_id: string }
        Returns: undefined
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

