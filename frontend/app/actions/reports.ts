"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import type { LifecycleConfig } from "@/lib/donor-lifecycle"
import {
  REPORT_COLUMN_CONFIG,
  mapRowToOutputColumns,
  runFilterQuery,
  type FilterRow,
} from "@/lib/reports/run-filter-query"
import { verifySaveToken } from "@/lib/reports/save-token"

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
  filters: CrmFilters,
  visibility: "private" | "shared" = "shared"
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
  let { data, error } = await supabase
    .from("saved_reports")
    .insert({
      organization_id: org.orgId,
      title,
      type: "crm",
      summary: summary || title,
      query: queryJson,
      visibility,
      created_by_user_id: org.userId,
    })
    .select("id")
    .single()

  // Columns added in a later migration may not exist yet — retry without them
  if (error?.message?.includes("created_by_user_id") || error?.message?.includes("visibility") || error?.message?.includes("summary")) {
    const fallback = await supabase
      .from("saved_reports")
      .insert({
        organization_id: org.orgId,
        title,
        type: "crm",
        query: queryJson,
      })
      .select("id")
      .single()
    data = fallback.data
    error = fallback.error
  }

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error("Failed to create report.")

  return { id: String(data.id) }
}

/**
 * Save an AI-built custom report. Verifies the signed token, re-runs the filter
 * to materialize CSV content, then inserts into saved_reports.
 *
 * The token enforces that the model can't alter the spec between preview and
 * save: only the exact filters/columns/title that the chat tool returned can
 * be persisted.
 */
export async function saveCustomReport(
  pendingSaveToken: string,
  visibility: "private" | "shared" = "private"
): Promise<{ id: string; title: string; rowCount: number }> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  let spec
  try {
    spec = verifySaveToken(pendingSaveToken)
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Invalid save token: ${e.message}`
        : "Invalid save token"
    )
  }

  if (spec.orgId !== org.orgId) {
    throw new Error("Save token org mismatch")
  }

  const filters: FilterRow[] = spec.filters.map((f) => ({
    id: f.id,
    field: f.field,
    operator: f.operator,
    value: f.value,
    value2: f.value2,
  }))

  const { rows, rowCount } = await runFilterQuery({
    orgId: org.orgId,
    filters,
    selectedColumns: spec.selectedColumns,
    allowEmpty: true,
  })

  const headerLabels = spec.selectedColumns.map(
    (id) => REPORT_COLUMN_CONFIG[id]?.label ?? id
  )
  const outputRows = rows.map((r) => mapRowToOutputColumns(r, spec.selectedColumns))
  const csv = [
    headerLabels.map(csvCell).join(","),
    ...outputRows.map((row) =>
      spec.selectedColumns.map((id) => csvCell(row[id])).join(",")
    ),
  ].join("\n")

  const filterCriteria = {
    type: "CSV",
    content: csv,
    summary: spec.summary,
    row_count: rowCount,
    bytes: Buffer.byteLength(csv, "utf8"),
    reportSource: "ai_chat" as const,
    filters,
    selectedColumns: spec.selectedColumns,
    visibility,
  }

  const supabase = createAdminClient()
  const insertPayloads: Array<Record<string, unknown>> = [
    {
      organization_id: org.orgId,
      title: spec.title,
      type: "CSV",
      content: csv,
      query: "",
      summary: spec.summary,
      records_count: rowCount,
      visibility,
      created_by_user_id: org.userId,
      filter_criteria: filterCriteria,
    },
    {
      organization_id: org.orgId,
      title: spec.title,
      type: "CSV",
      content: csv,
      query: "",
      summary: spec.summary,
      records_count: rowCount,
      filter_criteria: filterCriteria,
    },
    { organization_id: org.orgId, title: spec.title, filter_criteria: filterCriteria },
  ]

  let inserted: { id?: string } | null = null
  const errors: string[] = []
  for (const payload of insertPayloads) {
    const { data, error } = await supabase
      .from("saved_reports")
      .insert(payload as Record<string, unknown>)
      .select("id")
      .single()
    if (!error) {
      inserted = data
      break
    }
    errors.push(error.message)
  }

  if (!inserted?.id) {
    throw new Error(`Failed to save report: ${errors[0] ?? "unknown error"}`)
  }

  return { id: String(inserted.id), title: spec.title, rowCount }
}

function csvCell(value: unknown): string {
  if (value == null) return ""
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
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
