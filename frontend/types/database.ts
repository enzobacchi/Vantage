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
        }
        Insert: {
          id?: string
          name: string
          qb_realm_id?: string | null
          qb_access_token?: string | null
          qb_refresh_token?: string | null
        }
        Update: {
          id?: string
          name?: string
          qb_realm_id?: string | null
          qb_access_token?: string | null
          qb_refresh_token?: string | null
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
          location_lat: number | null
          location_lng: number | null
          total_lifetime_value: number | null
          last_donation_date: string | null
          notes: string | null
          donor_type: "individual" | "corporate" | "school" | "church"
          // embedding is handled by vector search, usually not needed in frontend types directly
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
          city?: string | null
          state?: string | null
          zip?: string | null
        }
        Update: {
          id?: string
          display_name?: string | null
          household_greeting?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
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
          donor_id: string
          amount: number
          date: string | null
          memo: string | null
          payment_method: string
          category_id: string | null
          campaign_id: string | null
          fund_id: string | null
          acknowledgment_sent_at: string | null
        }
        Insert: {
          id?: string
          donor_id: string
          amount: number
          date: string
          memo?: string | null
          payment_method?: string
          category_id?: string | null
          campaign_id?: string | null
          fund_id?: string | null
        }
        Update: {
          id?: string
          donor_id?: string
          amount?: number
          date?: string
          memo?: string | null
          payment_method?: string
          category_id?: string | null
          campaign_id?: string | null
          fund_id?: string | null
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