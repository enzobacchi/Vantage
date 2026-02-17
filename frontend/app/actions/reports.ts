"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import type { LifecycleConfig } from "@/lib/donor-lifecycle"

export type CrmFilters = {
  search: string
  tagIds: string[]
  lifecycleConfig: LifecycleConfig
  /** Column ids to include in the report (e.g. first_name, email, lifetime_value). */
  selectedColumns?: string[]
}

/**
 * Create a saved report from current CRM filters. Stores criteria (dynamic) so
 * when the report is run later, any donor matching the criteria is included.
 * Returns the new report id.
 */
export async function createReportFromCrm(
  name: string,
  filters: CrmFilters
): Promise<{ id: string }> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const title = name.trim()
  if (!title) throw new Error("Report name is required.")

  const summary = buildSummary(filters)
  const criteria = {
    source: "crm" as const,
    search: filters.search.trim() || undefined,
    tagIds: filters.tagIds.length ? filters.tagIds : undefined,
    lifecycleConfig: filters.lifecycleConfig,
    selectedColumns: filters.selectedColumns?.length ? filters.selectedColumns : undefined,
  }
  const queryJson = JSON.stringify(criteria)

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("saved_reports")
    .insert({
      organization_id: org.orgId,
      title,
      type: "crm",
      summary: summary || title,
      query: queryJson,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error("Failed to create report.")

  return { id: String(data.id) }
}

function buildSummary(f: CrmFilters): string {
  const parts: string[] = []
  if (f.search.trim()) parts.push(`Search: "${f.search.trim()}"`)
  if (f.tagIds.length) parts.push(`Tags: ${f.tagIds.length} selected`)
  const c = f.lifecycleConfig
  if (c?.newDonorMonths != null || c?.lapsedMonths != null || c?.majorDonorThreshold != null) {
    const opts: string[] = []
    if (c.newDonorMonths != null) opts.push(`New ≤${c.newDonorMonths}mo`)
    if (c.lapsedMonths != null) opts.push(`Lapsed >${c.lapsedMonths}mo`)
    if (c.majorDonorThreshold != null) opts.push(`Major >$${c.majorDonorThreshold}`)
    if (opts.length) parts.push(`Badges: ${opts.join(", ")}`)
  }
  return parts.length ? parts.join(" · ") : "CRM filters"
}
