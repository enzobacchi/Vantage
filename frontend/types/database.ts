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
          // embedding is handled by vector search, usually not needed in frontend types directly
        }
        Insert: {
          id?: string
          org_id: string
          qb_customer_id?: string | null
          display_name?: string | null
          email?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
        }
        Update: {
          id?: string
          display_name?: string | null
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
    }
  }
}