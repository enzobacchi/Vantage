import { createAdminClient } from "@/lib/supabase/admin"
import { CONTACT_FIELDS, jsonData, withApiV1 } from "@/lib/api-v1"
import { apiErrorResponse } from "@/lib/api-auth"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/v1/contacts/:id — fetch a single contact by Vantage id. */
export const GET = withApiV1(async (_req, ctx) => {
  const id = ctx.params.id
  if (!id || !UUID_RE.test(id)) {
    return apiErrorResponse(400, "invalid_request", "Invalid contact id.")
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("donors")
    .select(CONTACT_FIELDS)
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[api/v1/contacts/:id] query error:", error.message)
    return apiErrorResponse(500, "internal_error", "Failed to load contact.")
  }
  if (!data) {
    return apiErrorResponse(404, "not_found", "Contact not found.")
  }

  return jsonData(data)
})
