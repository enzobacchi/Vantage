export const PLEDGE_FREQUENCIES = [
  "one_time",
  "monthly",
  "quarterly",
  "annual",
] as const

export type PledgeFrequency = (typeof PLEDGE_FREQUENCIES)[number]

export const PLEDGE_STATUSES = [
  "active",
  "fulfilled",
  "cancelled",
  "overdue",
] as const

export type PledgeStatus = (typeof PLEDGE_STATUSES)[number]

export type Pledge = {
  id: string
  org_id: string
  donor_id: string
  amount: number
  frequency: PledgeFrequency
  start_date: string
  end_date: string | null
  status: PledgeStatus
  notes: string | null
  created_at: string
  updated_at: string
  donor?: { display_name: string | null } | null
  /** Computed: total donations linked to this pledge */
  amount_received?: number
  /** Computed: number of donations linked */
  payments_count?: number
}

export type CreatePledgeInput = {
  donor_id: string
  amount: number
  frequency?: PledgeFrequency
  start_date: string
  end_date?: string | null
  notes?: string | null
}

export type UpdatePledgeInput = {
  amount?: number
  frequency?: PledgeFrequency
  start_date?: string
  end_date?: string | null
  status?: PledgeStatus
  notes?: string | null
}
