"use server"

import { getCurrentUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

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

export async function getPipeline(): Promise<PipelineOpportunity[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("opportunities")
    .select("id,organization_id,donor_id,title,amount,status,expected_date,created_at,donors(display_name)")
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })

  if (error) return []

  return (data ?? []).map((row: any) => ({
    id: row.id,
    organization_id: row.organization_id,
    donor_id: row.donor_id,
    title: row.title ?? "Opportunity",
    amount: Number(row.amount) ?? 0,
    status: row.status as OpportunityStatus,
    expected_date: row.expected_date ?? null,
    created_at: row.created_at,
    donor: row.donors ?? null,
  }))
}

export async function updateOpportunityStatus(
  id: string,
  newStatus: OpportunityStatus
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { ok: false, error: "Unauthorized" }
  if (!OPPORTUNITY_STATUSES.includes(newStatus)) {
    return { ok: false, error: "Invalid status" }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("opportunities")
    .update({ status: newStatus })
    .eq("id", id)
    .eq("organization_id", org.orgId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function createOpportunity(
  data: CreateOpportunityData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const org = await getCurrentUserOrg()
    if (!org) return { ok: false, error: "Unauthorized" }

    const status = OPPORTUNITY_STATUSES.includes(data.status as OpportunityStatus)
      ? (data.status as OpportunityStatus)
      : "identified"

    const supabase = createAdminClient()
    const { data: row, error } = await supabase
      .from("opportunities")
      .insert({
        organization_id: org.orgId,
        donor_id: data.donor_id,
        title: (data.title ?? "Opportunity").trim() || "Opportunity",
        amount: Number(data.amount) ?? 0,
        status,
        expected_date: data.expected_date || null,
      })
      .select("id")
      .single()

    if (error) return { ok: false, error: error.message }
    if (!row?.id) return { ok: false, error: "Failed to create" }
    return { ok: true, id: row.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create opportunity"
    return { ok: false, error: message }
  }
}

export async function deleteOpportunity(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { ok: false, error: "Unauthorized" }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("opportunities")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
