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
      blog_posts: {
        Row: {
          id: string
          title: string | null
          slug: string | null
          content: string | null
          excerpt: string | null
          cover_image_url: string | null
          status: string
          published_at: string | null
          meta_title: string | null
          meta_description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title?: string | null
          slug?: string | null
          content?: string | null
          excerpt?: string | null
          cover_image_url?: string | null
          status?: string
          published_at?: string | null
          meta_title?: string | null
          meta_description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string | null
          slug?: string | null
          content?: string | null
          excerpt?: string | null
          cover_image_url?: string | null
          status?: string
          published_at?: string | null
          meta_title?: string | null
          meta_description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          company_id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          state: string | null
          zip: string | null
          logo_url: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          logo_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          logo_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
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
          id: string
          user_id: string
          name: string | null
          owner_name: string | null
          phone: string | null
          email: string | null
          website: string | null
          address: string | null
          city: string | null
          state: string | null
          zip: string | null
          license_number: string | null
          insurance_info: string | null
          industry: string | null
          brand_primary_color: string
          logo_url: string | null
          default_tax_rate: number
          default_payment_terms: string | null
          default_warranty_terms: string | null
          default_validity_days: number
          notify_on_view: boolean
          notify_on_accept: boolean
          notify_on_decline: boolean
          created_at: string
          updated_at: string
          theme_preference: string | null
          estimate_template_greeting: string | null
          estimate_template_opener: string | null
          estimate_template_closer: string | null
          estimate_template_signature: string | null
          custom_domain: string | null
          tier: string
          tier_trial_ends_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier_renews_at: string | null
          tier_cancelled_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          owner_name?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          license_number?: string | null
          insurance_info?: string | null
          industry?: string | null
          brand_primary_color?: string
          logo_url?: string | null
          default_tax_rate?: number
          default_payment_terms?: string | null
          default_warranty_terms?: string | null
          default_validity_days?: number
          notify_on_view?: boolean
          notify_on_accept?: boolean
          notify_on_decline?: boolean
          created_at?: string
          updated_at?: string
          theme_preference?: string | null
          estimate_template_greeting?: string | null
          estimate_template_opener?: string | null
          estimate_template_closer?: string | null
          estimate_template_signature?: string | null
          custom_domain?: string | null
          tier?: string
          tier_trial_ends_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_renews_at?: string | null
          tier_cancelled_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string | null
          owner_name?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          license_number?: string | null
          insurance_info?: string | null
          industry?: string | null
          brand_primary_color?: string
          logo_url?: string | null
          default_tax_rate?: number
          default_payment_terms?: string | null
          default_warranty_terms?: string | null
          default_validity_days?: number
          notify_on_view?: boolean
          notify_on_accept?: boolean
          notify_on_decline?: boolean
          created_at?: string
          updated_at?: string
          theme_preference?: string | null
          estimate_template_greeting?: string | null
          estimate_template_opener?: string | null
          estimate_template_closer?: string | null
          estimate_template_signature?: string | null
          custom_domain?: string | null
          tier?: string
          tier_trial_ends_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_renews_at?: string | null
          tier_cancelled_at?: string | null
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          id: string
          company_id: string
          event_type: string
          units: number | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          event_type: string
          units?: number | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          event_type?: string
          units?: number | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      company_price_book: {
        Row: {
          id: string
          company_id: string
          category: string | null
          name: string
          unit: string | null
          unit_price: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          category?: string | null
          name: string
          unit?: string | null
          unit_price?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          category?: string | null
          name?: string
          unit?: string | null
          unit_price?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_price_book_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_activity: {
        Row: {
          id: string
          project_id: string
          company_id: string
          estimate_id: string | null
          event_type: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          company_id: string
          estimate_id?: string | null
          event_type: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          company_id?: string
          estimate_id?: string | null
          event_type?: string
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
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
        ]
      }
      estimate_items: {
        Row: {
          id: string
          section_id: string
          company_id: string
          description: string | null
          quantity: number
          unit: string | null
          unit_price: number
          total: number
          sort_order: number
          price_source: string | null
        }
        Insert: {
          id?: string
          section_id: string
          company_id: string
          description?: string | null
          quantity?: number
          unit?: string | null
          unit_price?: number
          total?: number
          sort_order?: number
          price_source?: string | null
        }
        Update: {
          id?: string
          section_id?: string
          company_id?: string
          description?: string | null
          quantity?: number
          unit?: string | null
          unit_price?: number
          total?: number
          sort_order?: number
          price_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "estimate_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_sections: {
        Row: {
          id: string
          estimate_id: string
          company_id: string
          title: string | null
          sort_order: number
          subtotal: number
        }
        Insert: {
          id?: string
          estimate_id: string
          company_id: string
          title?: string | null
          sort_order?: number
          subtotal?: number
        }
        Update: {
          id?: string
          estimate_id?: string
          company_id?: string
          title?: string | null
          sort_order?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_sections_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_sections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          id: string
          project_id: string
          company_id: string
          version: number
          is_current: boolean
          share_token: string
          status: string
          summary: string | null
          notes: string | null
          timeline: string | null
          payment_terms: string | null
          warranty_terms: string | null
          subtotal: number
          discount_type: string | null
          discount_value: number
          discount_amount: number
          tax_rate: number
          tax_amount: number
          total: number
          sent_at: string | null
          viewed_at: string | null
          responded_at: string | null
          client_response: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          company_id: string
          version?: number
          is_current?: boolean
          share_token?: string
          status?: string
          summary?: string | null
          notes?: string | null
          timeline?: string | null
          payment_terms?: string | null
          warranty_terms?: string | null
          subtotal?: number
          discount_type?: string | null
          discount_value?: number
          discount_amount?: number
          tax_rate?: number
          tax_amount?: number
          total?: number
          sent_at?: string | null
          viewed_at?: string | null
          responded_at?: string | null
          client_response?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          company_id?: string
          version?: number
          is_current?: boolean
          share_token?: string
          status?: string
          summary?: string | null
          notes?: string | null
          timeline?: string | null
          payment_terms?: string | null
          warranty_terms?: string | null
          subtotal?: number
          discount_type?: string | null
          discount_value?: number
          discount_amount?: number
          tax_rate?: number
          tax_amount?: number
          total?: number
          sent_at?: string | null
          viewed_at?: string | null
          responded_at?: string | null
          client_response?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          id: string
          project_id: string
          company_id: string
          storage_path: string
          caption: string | null
          ai_description: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          company_id: string
          storage_path: string
          caption?: string | null
          ai_description?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          company_id?: string
          storage_path?: string
          caption?: string | null
          ai_description?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
          created_at: string
          notes: string | null
        }
        Insert: {
          user_id: string
          created_at?: string
          notes?: string | null
        }
        Update: {
          user_id?: string
          created_at?: string
          notes?: string | null
        }
        Relationships: []
      }
      platform_branding: {
        Row: {
          id: number
          app_name: string | null
          logo_url: string | null
          primary_color: string | null
          email_from_name: string | null
          updated_at: string
          updated_by: string | null
          site_title: string | null
          meta_description: string | null
          og_image_url: string | null
          canonical_base_url: string | null
          favicon_url: string | null
          landing_content: Json | null
        }
        Insert: {
          id?: number
          app_name?: string | null
          logo_url?: string | null
          primary_color?: string | null
          email_from_name?: string | null
          updated_at?: string
          updated_by?: string | null
          site_title?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          canonical_base_url?: string | null
          favicon_url?: string | null
          landing_content?: Json | null
        }
        Update: {
          id?: number
          app_name?: string | null
          logo_url?: string | null
          primary_color?: string | null
          email_from_name?: string | null
          updated_at?: string
          updated_by?: string | null
          site_title?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          canonical_base_url?: string | null
          favicon_url?: string | null
          landing_content?: Json | null
        }
        Relationships: []
      }
      platform_integrations: {
        Row: {
          provider: string
          ciphertext: string | null
          iv: string | null
          auth_tag: string | null
          updated_at: string
          updated_by: string | null
          metadata: Json | null
        }
        Insert: {
          provider: string
          ciphertext?: string | null
          iv?: string | null
          auth_tag?: string | null
          updated_at?: string
          updated_by?: string | null
          metadata?: Json | null
        }
        Update: {
          provider?: string
          ciphertext?: string | null
          iv?: string | null
          auth_tag?: string | null
          updated_at?: string
          updated_by?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          company_id: string
          client_id: string | null
          name: string
          project_type: string | null
          input_mode: 'audio' | 'text' | 'photos' | 'mixed' | null
          status: string
          target_budget: number | null
          total: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          client_id?: string | null
          name: string
          project_type?: string | null
          input_mode?: 'audio' | 'text' | 'photos' | 'mixed' | null
          status?: string
          target_budget?: number | null
          total?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          client_id?: string | null
          name?: string
          project_type?: string | null
          input_mode?: 'audio' | 'text' | 'photos' | 'mixed' | null
          status?: string
          target_budget?: number | null
          total?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          id: string
          project_id: string
          company_id: string
          storage_path: string | null
          duration_seconds: number | null
          transcript: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          company_id: string
          storage_path?: string | null
          duration_seconds?: number | null
          transcript?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          company_id?: string
          storage_path?: string
          duration_seconds?: number | null
          transcript?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          id: number
          source_text: string
          source_language: string
          target_language: string
          translated_text: string | null
          created_at: string
        }
        Insert: {
          id?: number
          source_text: string
          source_language?: string
          target_language: string
          translated_text?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          source_text?: string
          source_language?: string
          target_language?: string
          translated_text?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_orphan_draft_projects: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_platform_user_count: {
        Args: Record<PropertyKey, never>
        Returns: number
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
