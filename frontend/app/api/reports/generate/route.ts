import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripSqlArtifacts } from "@/lib/utils"

import {
  EmptyResultError,
  REPORT_COLUMN_CONFIG,
  VALID_COLUMN_IDS,
  mapRowToOutputColumns,
  runFilterQuery,
  type FilterRow,
} from "@/lib/reports/run-filter-query"

export const runtime = "nodejs"

function escapeCsvCell(value: unknown): string {
  if (value == null) return ""
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildTitleAndSummary(filters: FilterRow[]): { title: string; summary: string } {
  if (filters.length === 0) {
    return { title: "Filter Report", summary: "All donors (no filters)" }
  }
  const parts: string[] = []
  for (const f of filters) {
    const val = Array.isArray(f.value) ? f.value.length : f.value
    const val2 = f.value2 != null ? ` and ${f.value2}` : ""
    parts.push(`${f.field} ${f.operator} ${val}${val2}`)
  }
  return { title: "Filter Report", summary: parts.join("; ") }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      filters?: unknown
      selectedColumns?: unknown
      title?: string
      visibility?: string
      shared_with_user_ids?: unknown
      reportId?: string
      donorIds?: unknown
      allowEmpty?: boolean
    } | null

    const regenerateReportId = typeof body?.reportId === "string" ? body.reportId.trim() || null : null
    const rawFilters = body?.filters
    const rawSelectedColumns = body?.selectedColumns
    const allowEmpty = body?.allowEmpty === true

    const selectedColumns: string[] = Array.isArray(rawSelectedColumns)
      ? (rawSelectedColumns as string[]).filter(
          (c) => typeof c === "string" && VALID_COLUMN_IDS.has(c)
        )
      : Array.from(VALID_COLUMN_IDS)

    const filters: FilterRow[] = Array.isArray(rawFilters)
      ? (rawFilters as FilterRow[]).filter(
          (f) => f && typeof f.field === "string" && typeof f.operator === "string"
        )
      : []

    const customTitle = typeof body?.title === "string" ? body.title.trim() : ""
    const visibility =
      body?.visibility === "private"
        ? "private"
        : body?.visibility === "specific"
          ? "specific"
          : "shared"
    const sharedWithUserIds: string[] = Array.isArray(body?.shared_with_user_ids)
      ? (body.shared_with_user_ids as string[]).filter((id) => typeof id === "string" && id.trim())
      : []
    const rawDonorIds = body?.donorIds
    const donorIds =
      Array.isArray(rawDonorIds) && rawDonorIds.length > 0
        ? (rawDonorIds as string[]).filter((id) => typeof id === "string" && id.trim())
        : null

    const auth = await requireUserOrg()
    if (!auth.ok) return auth.response

    const supabase = createAdminClient()

    let rawRows: Array<Record<string, unknown>>

    // donorIds (e.g. from map selection) bypasses filters and just fetches by id.
    if (donorIds && donorIds.length > 0) {
      const selectStr = Array.from(
        new Set(
          ["id"].concat(
            selectedColumns.flatMap((id) => REPORT_COLUMN_CONFIG[id]?.dbColumns ?? [])
          )
        )
      ).join(",")
      const { data, error } = await supabase
        .from("donors")
        .select(selectStr)
        .eq("org_id", auth.orgId)
        .in("id", donorIds)
        .limit(5000)
      if (error) {
        return NextResponse.json(
          { error: "Failed to execute report query." },
          { status: 500 }
        )
      }
      rawRows = (data ?? []) as unknown as Array<Record<string, unknown>>
    } else {
      try {
        const result = await runFilterQuery({
          orgId: auth.orgId,
          filters,
          selectedColumns,
          allowEmpty,
        })
        rawRows = result.rows
      } catch (e) {
        if (e instanceof EmptyResultError) {
          return NextResponse.json({ error: e.message }, { status: 400 })
        }
        throw e
      }
    }

    const { title: defaultTitle, summary } = buildTitleAndSummary(filters)
    const title = customTitle || defaultTitle
    const headerLabels = selectedColumns.map(
      (id) => REPORT_COLUMN_CONFIG[id]?.label ?? id
    )
    const outputRows = rawRows.map((raw) =>
      mapRowToOutputColumns(raw, selectedColumns)
    )
    const csv = [
      headerLabels.map(escapeCsvCell).join(","),
      ...outputRows.map((row) =>
        selectedColumns.map((id) => escapeCsvCell(row[id])).join(",")
      ),
    ].join("\n")
    const rowCount = rawRows.length

    if (!csv.trim() && !allowEmpty) {
      return NextResponse.json(
        { error: "Generated report is empty. Try broader filters." },
        { status: 400 }
      )
    }

    const organization_id = auth.orgId
    const csvBytes = Buffer.byteLength(csv, "utf8")
    const queryValue = ""
    const filterCriteria = {
      type: "CSV",
      content: csv,
      summary,
      row_count: rowCount,
      bytes: csvBytes,
      reportSource: "generate" as const,
      filters,
      selectedColumns,
      visibility,
    }
    const insertPayloads: Array<Record<string, unknown>> = [
      { organization_id, title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount, visibility, created_by_user_id: auth.userId, filter_criteria: filterCriteria },
      { organization_id, title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount, filter_criteria: filterCriteria },
      { organization_id, title, filter_criteria: filterCriteria },
      { title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { title, filter_criteria: filterCriteria },
    ]

    if (regenerateReportId) {
      const updatePayloads: Array<Record<string, unknown>> = [
        { type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount, filter_criteria: filterCriteria },
        { content: csv, filter_criteria: filterCriteria },
      ]
      for (const update of updatePayloads) {
        const { error: updErr } = await supabase
          .from("saved_reports")
          .update(update as Record<string, unknown>)
          .eq("id", regenerateReportId)
          .eq("organization_id", auth.orgId)
          .select("id")
          .single()
        if (!updErr) {
          return NextResponse.json({
            success: true,
            reportId: regenerateReportId,
            rowCount,
            bytes: csvBytes,
            title: stripSqlArtifacts(title),
            summary: stripSqlArtifacts(summary),
          })
        }
        const { error: updErr2 } = await supabase
          .from("saved_reports")
          .update(update as Record<string, unknown>)
          .eq("id", regenerateReportId)
          .eq("org_id", auth.orgId)
          .select("id")
          .single()
        if (!updErr2) {
          return NextResponse.json({
            success: true,
            reportId: regenerateReportId,
            rowCount,
            bytes: csvBytes,
            title: stripSqlArtifacts(title),
            summary: stripSqlArtifacts(summary),
          })
        }
      }
      return NextResponse.json(
        { error: "Failed to update report. It may have been created by a different flow." },
        { status: 400 }
      )
    }

    // For preview/empty-allowed callers (the chat tool), don't persist — caller
    // saves explicitly via the saveCustomReport action when the user confirms.
    if (allowEmpty) {
      return NextResponse.json({
        success: true,
        rowCount,
        bytes: csvBytes,
        title: stripSqlArtifacts(title),
        summary: stripSqlArtifacts(summary),
        rows: rawRows,
        filters,
        selectedColumns,
      })
    }

    let inserted: { id?: string } | null = null
    const errors: string[] = []
    for (const payload of insertPayloads) {
      const { data: ins, error: insErr } = await supabase
        .from("saved_reports")
        .insert(payload as Record<string, unknown>)
        .select("id")
        .single()
      if (!insErr) {
        inserted = ins
        break
      }
      errors.push(insErr.message)
    }

    if (!inserted) {
      return NextResponse.json(
        { error: errors[0] ?? "Failed to save report.", details: errors },
        { status: 500 }
      )
    }

    const reportId = String(inserted?.id ?? "")
    if (visibility === "specific" && sharedWithUserIds.length > 0 && reportId) {
      await supabase.from("report_shares").insert(
        sharedWithUserIds.map((uid) => ({ report_id: reportId, user_id: uid }))
      )
    }

    return NextResponse.json({
      success: true,
      reportId,
      rowCount,
      bytes: csvBytes,
      title: stripSqlArtifacts(title),
      summary: stripSqlArtifacts(summary),
    })
  } catch (e: unknown) {
    const err = e as { message?: string; details?: string; hint?: string }
    const message = err?.message ?? (e instanceof Error ? e.message : "Unknown error")
    console.error("Report generate error:", message)
    return NextResponse.json(
      { error: message, details: err?.details ?? err?.hint ?? message },
      { status: 500 }
    )
  }
}
