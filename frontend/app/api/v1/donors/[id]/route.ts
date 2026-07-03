import { createAdminClient } from "@/lib/supabase/admin"
import { DONOR_FIELDS, jsonData, withApiV1 } from "@/lib/api-v1"
import { apiErrorResponse } from "@/lib/api-auth"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/v1/donors/:id — fetch a single donor by Vantage id.
 *
 * Also served at GET /api/v1/contacts/:id (deprecated alias).
 */
export const GET = withApiV1(async (_req, ctx) => {
  const id = ctx.params.id
  if (!id || !UUID_RE.test(id)) {
    return apiErrorResponse(400, "invalid_request", "Invalid donor id.")
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("donors")
    .select(DONOR_FIELDS)
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[api/v1/donors/:id] query error:", error.message)
    return apiErrorResponse(500, "internal_error", "Failed to load donor.")
  }
  if (!data) {
    return apiErrorResponse(404, "not_found", "Donor not found.")
  }

  return jsonData(data)
})
