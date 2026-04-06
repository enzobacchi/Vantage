export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          qb_realm_id: string | null
          qb_access_token: string | null
          qb_refresh_token: string | null
          tax_id: string | null
          legal_501c3_wording: string | null
          website_url: string | null
          logo_url: string | null
          last_synced_at: string | null
          updated_at: string | null
          stripe_customer_id: string | null
          onboarding_completed_at: string | null
        }
        Insert: {
          id?: string
          name: string
          qb_realm_id?: string | null
          qb_access_token?: string | null
          qb_refresh_token?: string | null
          tax_id?: string | null
          legal_501c3_wording?: string | null
          website_url?: string | null
          logo_url?: string | null
          last_synced_at?: string | null
          updated_at?: string | null
          stripe_customer_id?: string | null
          onboarding_completed_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          qb_realm_id?: string | null
          qb_access_token?: string | null
          qb_refresh_token?: string | null
          tax_id?: string | null
          legal_501c3_wording?: string | null
          website_url?: string | null
          logo_url?: string | null
          last_synced_at?: string | null
          updated_at?: string | null
          stripe_customer_id?: string | null
          onboarding_completed_at?: string | null
        }
      }
      donors: {
        Row: {
          id: string
          org_id: string
          qb_customer_id: string | null
          display_name: string | null
          household_greeting: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          billing_address: string | null
          city: string | null
          state: string | null
          zip: string | null
          mailing_address: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          location_lat: number | null
          location_lng: number | null
          total_lifetime_value: number | null
          last_donation_date: string | null
          notes: string | null
          last_donation_amount: number | null
          donor_type: "individual" | "corporate" | "school" | "church"
        }
        Insert: {
          id?: string
          org_id: string
          qb_customer_id?: string | null
          display_name?: string | null
          household_greeting?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          billing_address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          location_lat?: number | null
          location_lng?: number | null
          total_lifetime_value?: number | null
          last_donation_date?: string | null
          last_donation_amount?: number | null
          donor_type?: "individual" | "corporate" | "school" | "church"
        }
        Update: {
          id?: string
          display_name?: string | null
          household_greeting?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          billing_address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          location_lat?: number | null
          location_lng?: number | null
          total_lifetime_value?: number | null
          last_donation_date?: string | null
          last_donation_amount?: number | null
          donor_type?: "individual" | "corporate" | "school" | "church"
          notes?: string | null
        }
      }
      saved_reports: {
        Row: {
          id: string
          title: string
          filter_criteria: Json
          created_at: string
          visibility: string
          created_by_user_id: string | null
        }
      }
      report_shares: {
        Row: {
          id: string
          report_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          user_id?: string
          created_at?: string
        }
      }
      donor_notes: {
        Row: {
          id: string
          donor_id: string
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          donor_id: string
          note: string
          created_at?: string
        }
        Update: {
          id?: string
          donor_id?: string
          note?: string
          created_at?: string
        }
      }
      saved_lists: {
        Row: {
          id: string
          organization_id: string
          name: string
          icon: string
          filters: Json
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          icon?: string
          filters?: Json
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          icon?: string
          filters?: Json
          created_at?: string
        }
      }
      opportunities: {
        Row: {
          id: string
          organization_id: string
          donor_id: string
          title: string
          amount: number
          status: string
          expected_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          donor_id: string
          title?: string
          amount?: number
          status?: string
          expected_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          donor_id?: string
          title?: string
          amount?: number
          status?: string
          expected_date?: string | null
          created_at?: string
        }
      }
      donations: {
        Row: {
          id: string
          org_id: string
          donor_id: string
          amount: number
          date: string | null
          memo: string | null
          payment_method: string
          source: string | null
          category_id: string | null
          campaign_id: string | null
          fund_id: string | null
          pledge_id: string | null
          acknowledgment_sent_at: string | null
          acknowledgment_sent_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          donor_id: string
          amount: number
          date: string
          memo?: string | null
          payment_method?: string
          source?: string | null
          category_id?: string | null
          campaign_id?: string | null
          fund_id?: string | null
          pledge_id?: string | null
          acknowledgment_sent_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          donor_id?: string
          amount?: number
          date?: string
          memo?: string | null
          payment_method?: string
          source?: string | null
          category_id?: string | null
          campaign_id?: string | null
          fund_id?: string | null
          pledge_id?: string | null
          acknowledgment_sent_at?: string | null
          acknowledgment_sent_by?: string | null
        }
      }
      pledges: {
        Row: {
          id: string
          org_id: string
          donor_id: string
          amount: number
          frequency: "one_time" | "monthly" | "quarterly" | "annual"
          start_date: string
          end_date: string | null
          status: "active" | "fulfilled" | "cancelled" | "overdue"
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          donor_id: string
          amount: number
          frequency?: "one_time" | "monthly" | "quarterly" | "annual"
          start_date: string
          end_date?: string | null
          status?: "active" | "fulfilled" | "cancelled" | "overdue"
          notes?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          donor_id?: string
          amount?: number
          frequency?: "one_time" | "monthly" | "quarterly" | "annual"
          start_date?: string
          end_date?: string | null
          status?: "active" | "fulfilled" | "cancelled" | "overdue"
          notes?: string | null
        }
      }
      org_donation_options: {
        Row: {
          id: string
          org_id: string
          type: "category" | "campaign" | "fund"
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          type: "category" | "campaign" | "fund"
          name: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          type?: "category" | "campaign" | "fund"
          name?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      receipt_templates: {
        Row: {
          id: string
          org_id: string
          category: ReceiptTemplateCategory
          name: string
          subject: string
          body: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          category: ReceiptTemplateCategory
          name: string
          subject?: string
          body?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          category?: ReceiptTemplateCategory
          name?: string
          subject?: string
          body?: string
          sort_order?: number
          updated_at?: string
        }
      }
      interactions: {
        Row: {
          id: string
          donor_id: string
          type: "email" | "call" | "meeting" | "note" | "task"
          direction: "inbound" | "outbound" | null
          subject: string | null
          content: string
          date: string
          status: "pending" | "completed" | null
          created_at: string
        }
        Insert: {
          id?: string
          donor_id: string
          type: "email" | "call" | "meeting" | "note" | "task"
          direction?: "inbound" | "outbound" | null
          subject?: string | null
          content?: string
          date?: string
          status?: "pending" | "completed" | null
          created_at?: string
        }
        Update: {
          id?: string
          donor_id?: string
          type?: "email" | "call" | "meeting" | "note" | "task"
          direction?: "inbound" | "outbound" | null
          subject?: string | null
          content?: string
          date?: string
          status?: "pending" | "completed" | null
          created_at?: string
        }
      }
      chat_history: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: "user" | "assistant" | "system"
          content: string
          tool_invocations: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role: "user" | "assistant" | "system"
          content: string
          tool_invocations?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: "user" | "assistant" | "system"
          content?: string
          tool_invocations?: Json | null
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          org_id: string
          stripe_subscription_id: string | null
          plan_id: SubscriptionPlan
          status: SubscriptionStatus
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          stripe_subscription_id?: string | null
          plan_id?: SubscriptionPlan
          status?: SubscriptionStatus
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          stripe_subscription_id?: string | null
          plan_id?: SubscriptionPlan
          status?: SubscriptionStatus
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      subscription_usage: {
        Row: {
          id: string
          org_id: string
          metric: UsageMetric
          count: number
          period_start: string
          period_end: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          metric: UsageMetric
          count?: number
          period_start: string
          period_end: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          metric?: UsageMetric
          count?: number
          period_start?: string
          period_end?: string
          created_at?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          org_id: string
          user_id: string
          action: string
          entity_type: string
          entity_id: string | null
          summary: string
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          action: string
          entity_type: string
          entity_id?: string | null
          summary: string
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          summary?: string
          details?: Json
          created_at?: string
        }
      }
      notification_preferences: {
        Row: {
          id: string
          org_id: string
          user_id: string
          email_new_donation: boolean
          email_donor_milestone: boolean
          email_weekly_digest: boolean
          email_team_activity: boolean
          email_system_alerts: boolean
          inapp_new_donation: boolean
          inapp_task_reminders: boolean
          inapp_donor_lapsed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          email_new_donation?: boolean
          email_donor_milestone?: boolean
          email_weekly_digest?: boolean
          email_team_activity?: boolean
          email_system_alerts?: boolean
          inapp_new_donation?: boolean
          inapp_task_reminders?: boolean
          inapp_donor_lapsed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          email_new_donation?: boolean
          email_donor_milestone?: boolean
          email_weekly_digest?: boolean
          email_team_activity?: boolean
          email_system_alerts?: boolean
          inapp_new_donation?: boolean
          inapp_task_reminders?: boolean
          inapp_donor_lapsed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      dashboard_preferences: {
        Row: {
          id: string
          org_id: string
          user_id: string
          show_metric_cards: boolean
          show_smart_actions: boolean
          show_donations_chart: boolean
          show_recent_gifts: boolean
          show_top_donors: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          show_metric_cards?: boolean
          show_smart_actions?: boolean
          show_donations_chart?: boolean
          show_recent_gifts?: boolean
          show_top_donors?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          show_metric_cards?: boolean
          show_smart_actions?: boolean
          show_donations_chart?: boolean
          show_recent_gifts?: boolean
          show_top_donors?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      donor_merge_history: {
        Row: {
          id: string
          org_id: string
          user_id: string
          kept_donor_id: string
          merged_donor_id: string
          merged_donor_snapshot: Json
          donations_moved: number
          interactions_moved: number
          notes_moved: number
          tags_moved: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          kept_donor_id: string
          merged_donor_id: string
          merged_donor_snapshot?: Json
          donations_moved?: number
          interactions_moved?: number
          notes_moved?: number
          tags_moved?: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          kept_donor_id?: string
          merged_donor_id?: string
          merged_donor_snapshot?: Json
          donations_moved?: number
          interactions_moved?: number
          notes_moved?: number
          tags_moved?: number
          created_at?: string
        }
      }
    }
  }
}

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