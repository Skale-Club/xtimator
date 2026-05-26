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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
          brand_primary_color: string | null
          city: string | null
          created_at: string
          currency_code: string
          custom_domain: string | null
          default_estimate_language: string | null
          default_payment_terms: string | null
          default_tax_rate: number | null
          default_validity_days: number | null
          default_warranty_terms: string | null
          digital_signature_enabled: boolean
          email: string | null
          email_delivery_enabled: boolean
          estimate_template_closer: string | null
          estimate_template_greeting: string | null
          estimate_template_opener: string | null
          estimate_template_signature: string | null
          estimate_terms_enabled: boolean
          estimate_terms_text: string | null
          id: string
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
          sms_delivery_enabled: boolean
          state: string | null
          stripe_account_display_name: string | null
          stripe_account_email: string | null
          stripe_account_id: string | null
          stripe_connect_status: string | null
          stripe_connected_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          theme_preference: string | null
          tier: string
          tier_cancelled_at: string | null
          tier_renews_at: string | null
          tier_trial_ends_at: string | null
          updated_at: string
          user_id: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          ai_model_override?: string | null
          brand_primary_color?: string | null
          city?: string | null
          created_at?: string
          currency_code?: string
          custom_domain?: string | null
          default_estimate_language?: string | null
          default_payment_terms?: string | null
          default_tax_rate?: number | null
          default_validity_days?: number | null
          default_warranty_terms?: string | null
          digital_signature_enabled?: boolean
          email?: string | null
          email_delivery_enabled?: boolean
          estimate_template_closer?: string | null
          estimate_template_greeting?: string | null
          estimate_template_opener?: string | null
          estimate_template_signature?: string | null
          estimate_terms_enabled?: boolean
          estimate_terms_text?: string | null
          id?: string
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
          sms_delivery_enabled?: boolean
          state?: string | null
          stripe_account_display_name?: string | null
          stripe_account_email?: string | null
          stripe_account_id?: string | null
          stripe_connect_status?: string | null
          stripe_connected_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          theme_preference?: string | null
          tier?: string
          tier_cancelled_at?: string | null
          tier_renews_at?: string | null
          tier_trial_ends_at?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          ai_model_override?: string | null
          brand_primary_color?: string | null
          city?: string | null
          created_at?: string
          currency_code?: string
          custom_domain?: string | null
          default_estimate_language?: string | null
          default_payment_terms?: string | null
          default_tax_rate?: number | null
          default_validity_days?: number | null
          default_warranty_terms?: string | null
          digital_signature_enabled?: boolean
          email?: string | null
          email_delivery_enabled?: boolean
          estimate_template_closer?: string | null
          estimate_template_greeting?: string | null
          estimate_template_opener?: string | null
          estimate_template_signature?: string | null
          estimate_terms_enabled?: boolean
          estimate_terms_text?: string | null
          id?: string
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
          sms_delivery_enabled?: boolean
          state?: string | null
          stripe_account_display_name?: string | null
          stripe_account_email?: string | null
          stripe_account_id?: string | null
          stripe_connect_status?: string | null
          stripe_connected_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          theme_preference?: string | null
          tier?: string
          tier_cancelled_at?: string | null
          tier_renews_at?: string | null
          tier_trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      company_price_book: {
        Row: {
          company_id: string
          created_at: string
          currency_code: string
          folder_id: string | null
          id: string
          image_url: string | null
          name: string
          notes: string | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          currency_code?: string
          folder_id?: string | null
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          unit?: string | null
          unit_price?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          currency_code?: string
          folder_id?: string | null
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
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
      company_whatsapp: {
        Row: {
          company_id: string
          created_at: string
          delivery_format: string
          id: string
          phone_number: string
          phone_number_id: string
          status: string
          verification_attempts: number
          verification_code: string | null
          verification_expires_at: string | null
          verified_at: string | null
          waba_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_format?: string
          id?: string
          phone_number: string
          phone_number_id: string
          status?: string
          verification_attempts?: number
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
          waba_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_format?: string
          id?: string
          phone_number?: string
          phone_number_id?: string
          status?: string
          verification_attempts?: number
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
          waba_id?: string
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
          description: string
          id: string
          price_source: string | null
          quantity: number
          section_id: string
          sort_order: number
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          company_id: string
          description: string
          id?: string
          price_source?: string | null
          quantity?: number
          section_id: string
          sort_order?: number
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          company_id?: string
          description?: string
          id?: string
          price_source?: string | null
          quantity?: number
          section_id?: string
          sort_order?: number
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
          client_response: string | null
          company_id: string
          created_at: string
          currency_code: string
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          id: string
          is_current: boolean
          language: string
          notes: string | null
          paid_at: string | null
          payment_amount_cents: number | null
          payment_status: string
          payment_terms: string | null
          project_id: string
          responded_at: string | null
          sent_at: string | null
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
        }
        Insert: {
          client_response?: string | null
          company_id: string
          created_at?: string
          currency_code?: string
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          is_current?: boolean
          language?: string
          notes?: string | null
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_status?: string
          payment_terms?: string | null
          project_id: string
          responded_at?: string | null
          sent_at?: string | null
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
        }
        Update: {
          client_response?: string | null
          company_id?: string
          created_at?: string
          currency_code?: string
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          is_current?: boolean
          language?: string
          notes?: string | null
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_status?: string
          payment_terms?: string | null
          project_id?: string
          responded_at?: string | null
          sent_at?: string | null
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
      notification_preferences: {
        Row: {
          categories: Json
          email_digest_enabled: boolean
          push_subscription: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          email_digest_enabled?: boolean
          push_subscription?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          email_digest_enabled?: boolean
          push_subscription?: Json | null
          updated_at?: string
          user_id?: string
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
          client_id: string | null
          company_id: string
          created_at: string
          id: string
          input_mode: string | null
          name: string
          project_type: string | null
          status: string
          target_budget: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          input_mode?: string | null
          name: string
          project_type?: string | null
          status?: string
          target_budget?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          input_mode?: string | null
          name?: string
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
      [_ in never]: never
    }
    Functions: {
      cleanup_orphan_draft_projects: {
        Args: never
        Returns: {
          deleted_count: number
        }[]
      }
      get_platform_user_count: { Args: never; Returns: number }
      is_platform_admin: { Args: never; Returns: boolean }
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
