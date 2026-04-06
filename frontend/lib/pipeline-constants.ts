export const OPPORTUNITY_STATUSES = [
  "identified",
  "qualified",
  "solicited",
  "committed",
  "closed_won",
  "closed_lost",
] as const

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]

export type PipelineOpportunity = {
  id: string
  organization_id: string
  donor_id: string
  title: string
  amount: number
  status: OpportunityStatus
  expected_date: string | null
  created_at: string
  donor?: { display_name: string | null } | null
}

export type CreateOpportunityData = {
  donor_id: string
  title?: string
  amount: number
  status: OpportunityStatus
  expected_date?: string | null
}
