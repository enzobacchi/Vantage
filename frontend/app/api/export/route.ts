import { NextRequest } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildExport, EXPORT_TYPES, type ExportType } from "@/lib/export-builders"

/**
 * GET /api/export?type=donors|donations|interactions
 *
 * Exports org-scoped data as CSV for GDPR data portability.
 * Requires authentication and scopes all queries by org_id.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const type = request.nextUrl.searchParams.get("type") as ExportType | null
  if (!type || !EXPORT_TYPES.includes(type)) {
    return Response.json(
      { error: "Invalid export type. Must be one of: donors, donations, interactions" },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    const { csv, filename } = await buildExport(supabase, auth.orgId, type)

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return Response.json({ error: "Export failed. Please try again later." }, { status: 500 })
  }
}
