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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          org_id: string
          summary: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          org_id: string
          summary: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          org_id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          donor_registry: Json
          id: string
          organization_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          donor_registry?: Json
          id?: string
          organization_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          donor_registry?: Json
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_history: {
        Row: {
          content: string
          created_at: string
          id: string
          org_id: string
          role: string
          tool_invocations: Json | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          org_id: string
          role: string
          tool_invocations?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          tool_invocations?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          donor_references: Json | null
          id: string
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          donor_references?: Json | null
          id?: string
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          donor_references?: Json | null
          id?: string
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      donations: {
        Row: {
          acknowledgment_sent_at: string | null
          acknowledgment_sent_by: string | null
          acknowledgment_status: string
          amount: number | null
          assigned_to: string | null
          campaign_id: string | null
          category_id: string | null
          check_number: string | null
          created_at: string
          created_by: string | null
          date: string | null
          deposit_date: string | null
          donor_id: string | null
          fund_id: string | null
          gift_date: string | null
          gift_type: string
          id: string
          is_anonymous: boolean
          memo: string | null
          notes: string | null
          org_id: string
          payment_method: string
          payment_type_id: string | null
          pledge_id: string | null
          source: string
        }
        Insert: {
          acknowledgment_sent_at?: string | null
          acknowledgment_sent_by?: string | null
          acknowledgment_status?: string
          amount?: number | null
          assigned_to?: string | null
          campaign_id?: string | null
          category_id?: string | null
          check_number?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deposit_date?: string | null
          donor_id?: string | null
          fund_id?: string | null
          gift_date?: string | null
          gift_type?: string
          id?: string
          is_anonymous?: boolean
          memo?: string | null
          notes?: string | null
          org_id: string
          payment_method?: string
          payment_type_id?: string | null
          pledge_id?: string | null
          source?: string
        }
        Update: {
          acknowledgment_sent_at?: string | null
          acknowledgment_sent_by?: string | null
          acknowledgment_status?: string
          amount?: number | null
          assigned_to?: string | null
          campaign_id?: string | null
          category_id?: string | null
          check_number?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deposit_date?: string | null
          donor_id?: string | null
          fund_id?: string | null
          gift_date?: string | null
          gift_type?: string
          id?: string
          is_anonymous?: boolean
          memo?: string | null
          notes?: string | null
          org_id?: string
          payment_method?: string
          payment_type_id?: string | null
          pledge_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "donations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "gift_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "gift_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "gift_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_payment_type_id_fkey"
            columns: ["payment_type_id"]
            isOneToOne: false
            referencedRelation: "payment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_merge_history: {
        Row: {
          created_at: string
          donations_moved: number
          id: string
          interactions_moved: number
          kept_donor_id: string
          merged_donor_id: string
          merged_donor_snapshot: Json
          notes_moved: number
          org_id: string
          tags_moved: number
          user_id: string
        }
        Insert: {
          created_at?: string
          donations_moved?: number
          id?: string
          interactions_moved?: number
          kept_donor_id: string
          merged_donor_id: string
          merged_donor_snapshot?: Json
          notes_moved?: number
          org_id: string
          tags_moved?: number
          user_id: string
        }
        Update: {
          created_at?: string
          donations_moved?: number
          id?: string
          interactions_moved?: number
          kept_donor_id?: string
          merged_donor_id?: string
          merged_donor_snapshot?: Json
          notes_moved?: number
          org_id?: string
          tags_moved?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_merge_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_notes: {
        Row: {
          created_at: string
          donor_id: string
          id: string
          note: string
        }
        Insert: {
          created_at?: string
          donor_id: string
          id?: string
          note: string
        }
        Update: {
          created_at?: string
          donor_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_notes_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_tags: {
        Row: {
          donor_id: string
          tag_id: string
        }
        Insert: {
          donor_id: string
          tag_id: string
        }
        Update: {
          donor_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_tags_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      donors: {
        Row: {
          acquisition_source: string | null
          assigned_to: string | null
          billing_address: string | null
          city: string | null
          created_at: string
          display_name: string | null
          donor_type: string
          email: string | null
          embedding: string | null
          first_name: string | null
          household_greeting: string | null
          id: string
          last_donation_amount: number | null
          last_donation_date: string | null
          last_name: string | null
          location_lat: number | null
          location_lng: number | null
          mailing_address: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          notes: string | null
          org_id: string | null
          phone: string | null
          qb_customer_id: string | null
          state: string | null
          total_lifetime_value: number | null
          zip: string | null
        }
        Insert: {
          acquisition_source?: string | null
          assigned_to?: string | null
          billing_address?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          donor_type?: string
          email?: string | null
          embedding?: string | null
          first_name?: string | null
          household_greeting?: string | null
          id?: string
          last_donation_amount?: number | null
          last_donation_date?: string | null
          last_name?: string | null
          location_lat?: number | null
          location_lng?: number | null
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          qb_customer_id?: string | null
          state?: string | null
          total_lifetime_value?: number | null
          zip?: string | null
        }
        Update: {
          acquisition_source?: string | null
          assigned_to?: string | null
          billing_address?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          donor_type?: string
          email?: string | null
          embedding?: string | null
          first_name?: string | null
          household_greeting?: string | null
          id?: string
          last_donation_amount?: number | null
          last_donation_date?: string | null
          last_name?: string | null
          location_lat?: number | null
          location_lng?: number | null
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          qb_customer_id?: string | null
          state?: string | null
          total_lifetime_value?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          id: string
          org_id: string
          sent_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          org_id: string
          sent_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          sent_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_campaigns: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_funds: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_funds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_credentials: {
        Row: {
          access_token_encrypted: string
          access_token_expires_at: string | null
          created_at: string
          google_email: string
          id: string
          last_send_at: string | null
          needs_reauth: boolean
          org_id: string
          refresh_token_encrypted: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          access_token_expires_at?: string | null
          created_at?: string
          google_email: string
          id?: string
          last_send_at?: string | null
          needs_reauth?: boolean
          org_id: string
          refresh_token_encrypted: string
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          access_token_expires_at?: string | null
          created_at?: string
          google_email?: string
          id?: string
          last_send_at?: string | null
          needs_reauth?: boolean
          org_id?: string
          refresh_token_encrypted?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          content: string
          created_at: string
          date: string
          direction: string | null
          donor_id: string
          id: string
          status: string | null
          subject: string | null
          type: string
        }
        Insert: {
          content?: string
          created_at?: string
          date?: string
          direction?: string | null
          donor_id: string
          id?: string
          status?: string | null
          subject?: string | null
          type: string
        }
        Update: {
          content?: string
          created_at?: string
          date?: string
          direction?: string | null
          donor_id?: string
          id?: string
          status?: string | null
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          organization_id: string
          role: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          organization_id: string
          role?: string
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_donor_milestone: boolean
          email_new_donation: boolean
          email_system_alerts: boolean
          email_team_activity: boolean
          email_weekly_digest: boolean
          id: string
          inapp_donor_lapsed: boolean
          inapp_new_donation: boolean
          inapp_task_reminders: boolean
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_donor_milestone?: boolean
          email_new_donation?: boolean
          email_system_alerts?: boolean
          email_team_activity?: boolean
          email_weekly_digest?: boolean
          id?: string
          inapp_donor_lapsed?: boolean
          inapp_new_donation?: boolean
          inapp_task_reminders?: boolean
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_donor_milestone?: boolean
          email_new_donation?: boolean
          email_system_alerts?: boolean
          email_team_activity?: boolean
          email_weekly_digest?: boolean
          id?: string
          inapp_donor_lapsed?: boolean
          inapp_new_donation?: boolean
          inapp_task_reminders?: boolean
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number
          created_at: string
          donor_id: string
          expected_date: string | null
          id: string
          organization_id: string
          status: string
          title: string
        }
        Insert: {
          amount?: number
          created_at?: string
          donor_id: string
          expected_date?: string | null
          id?: string
          organization_id: string
          status?: string
          title?: string
        }
        Update: {
          amount?: number
          created_at?: string
          donor_id?: string
          expected_date?: string | null
          id?: string
          organization_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_donation_options: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_donation_options_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          tos_accepted_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          tos_accepted_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          tos_accepted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          fiscal_year_start_month: number
          id: string
          last_synced_at: string | null
          legal_501c3_wording: string | null
          logo_url: string | null
          name: string | null
          onboarding_completed_at: string | null
          qb_access_token: string | null
          qb_realm_id: string | null
          qb_refresh_token: string | null
          stripe_customer_id: string | null
          tax_id: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string
          fiscal_year_start_month?: number
          id?: string
          last_synced_at?: string | null
          legal_501c3_wording?: string | null
          logo_url?: string | null
          name?: string | null
          onboarding_completed_at?: string | null
          qb_access_token?: string | null
          qb_realm_id?: string | null
          qb_refresh_token?: string | null
          stripe_customer_id?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string
          fiscal_year_start_month?: number
          id?: string
          last_synced_at?: string | null
          legal_501c3_wording?: string | null
          logo_url?: string | null
          name?: string | null
          onboarding_completed_at?: string | null
          qb_access_token?: string | null
          qb_realm_id?: string | null
          qb_refresh_token?: string | null
          stripe_customer_id?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      payment_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pledges: {
        Row: {
          amount: number
          created_at: string | null
          donor_id: string
          end_date: string | null
          frequency: string
          id: string
          notes: string | null
          org_id: string
          start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          donor_id: string
          end_date?: string | null
          frequency?: string
          id?: string
          notes?: string | null
          org_id: string
          start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          donor_id?: string
          end_date?: string | null
          frequency?: string
          id?: string
          notes?: string | null
          org_id?: string
          start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pledges_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          category: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_folders: {
        Row: {
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_shares: {
        Row: {
          created_at: string
          id: string
          report_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_lists: {
        Row: {
          created_at: string
          filters: Json
          icon: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          icon?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          icon?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          content: string | null
          created_at: string
          created_by_user_id: string | null
          filter_criteria: Json
          folder_id: string | null
          id: string
          organization_id: string | null
          query: string
          records_count: number | null
          summary: string | null
          title: string
          type: string | null
          user_id: string | null
          visibility: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by_user_id?: string | null
          filter_criteria?: Json
          folder_id?: string | null
          id?: string
          organization_id?: string | null
          query: string
          records_count?: number | null
          summary?: string | null
          title: string
          type?: string | null
          user_id?: string | null
          visibility?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by_user_id?: string | null
          filter_criteria?: Json
          folder_id?: string | null
          id?: string
          organization_id?: string | null
          query?: string
          records_count?: number | null
          summary?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "report_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_usage: {
        Row: {
          count: number
          created_at: string
          id: string
          metric: string
          org_id: string
          period_end: string
          period_start: string
          updated_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          metric: string
          org_id: string
          period_end: string
          period_start: string
          updated_at?: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          metric?: string
          org_id?: string
          period_end?: string
          period_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string
          plan_id: string
          status: string
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          trial_reminder_sent_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_reminder_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_reminder_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          id: string
          is_completed: boolean
          organization_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_completed?: boolean
          organization_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_completed?: boolean
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          message: string
          organization_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          message: string
          organization_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          message?: string
          organization_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_donors:
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
            }
            Returns: {
              billing_address: string
              display_name: string
              email: string
              embedding: string
              id: string
              last_donation_date: string
              location_lat: number
              location_lng: number
              org_id: string
              phone: string
              qb_customer_id: string
              similarity: number
              total_lifetime_value: number
            }[]
          }
        | {
            Args: {
              match_count: number
              match_threshold: number
              p_org_id?: string
              query_embedding: string
            }
            Returns: {
              billing_address: string
              display_name: string
              email: string
              embedding: string
              id: string
              last_donation_date: string
              location_lat: number
              location_lng: number
              org_id: string
              phone: string
              qb_customer_id: string
              similarity: number
              total_lifetime_value: number
            }[]
          }
      report_acquisition_rate: {
        Args: { p_org_id: string; p_period_end: string; p_period_start: string }
        Returns: Json
      }
      report_new_leads_by_source: {
        Args: { p_org_id: string; p_period_end: string; p_period_start: string }
        Returns: Json
      }
      report_recapture: {
        Args: {
          p_lapsed_window_max_years?: number
          p_lapsed_window_min_years?: number
          p_org_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      report_retention_rate: {
        Args: {
          p_org_id: string
          p_period_end: string
          p_period_start: string
          p_prior_period_end: string
          p_prior_period_start: string
        }
        Returns: Json
      }
      user_org_membership: { Args: { org_id: string }; Returns: boolean }
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

// ---------------------------------------------------------------------------
// Hand-written aliases and string-literal unions.
//
// These are NOT regenerated by `mcp__supabase__generate_typescript_types`.
// The underlying DB columns are typed `text`, not Postgres enums, so the
// generator can only produce `string`. The narrow unions here encode the
// application-level contract (what values actually get written).
//
// When regenerating: replace the `Database` interface above with fresh output
// and keep this tail block intact.
// ---------------------------------------------------------------------------

/** CRM interaction row (single donor touchpoint or task). */
export type Interaction = Database["public"]["Tables"]["interactions"]["Row"]

/** Donation row with payment method and optional category/campaign/fund. */
export type Donation = Database["public"]["Tables"]["donations"]["Row"]

/** Org-scoped dropdown option for categories, campaigns, or funds. */
export type OrgDonationOption = Database["public"]["Tables"]["org_donation_options"]["Row"]

export type PaymentMethod =
  | "check"
  | "cash"
  | "zelle"
  | "wire"
  | "venmo"
  | "other"
  | "quickbooks"
  | "daf"

export type DonorType = "individual" | "corporate" | "school" | "church"

export type ReceiptTemplateCategory = "standard" | "daf" | "institutional"

export type SubscriptionPlan = "trial" | "essentials" | "growth" | "pro" | "enterprise"
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid"
export type UsageMetric = "ai_insights" | "email_sends" | "donors"

export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"]
export type SubscriptionUsage = Database["public"]["Tables"]["subscription_usage"]["Row"]

export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"]
export type NotificationPreferences = Database["public"]["Tables"]["notification_preferences"]["Row"]
export type DonorMergeHistory = Database["public"]["Tables"]["donor_merge_history"]["Row"]
