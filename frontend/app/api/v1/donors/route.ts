import { createAdminClient } from "@/lib/supabase/admin"
import {
  DONOR_FIELDS,
  decodeCursor,
  encodeCursor,
  jsonList,
  parseLimit,
  withApiV1,
} from "@/lib/api-v1"
import { apiErrorResponse } from "@/lib/api-auth"

/**
 * GET /api/v1/donors?email=&external_id=&limit=&cursor=
 *
 * Lists the org's donors, newest first, keyset-paginated.
 * `email` matches case-insensitively; `external_id` matches exactly.
 *
 * Also served at GET /api/v1/contacts (deprecated alias).
 */
export const GET = withApiV1(async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const limit = parseLimit(searchParams)
  const email = searchParams.get("email")?.trim()
  const externalId = searchParams.get("external_id")?.trim()
  const cursorParam = searchParams.get("cursor")?.trim()

  const supabase = createAdminClient()
  let query = supabase
    .from("donors")
    .select(DONOR_FIELDS)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)

  if (email) query = query.ilike("email", email)
  if (externalId) query = query.eq("external_id", externalId)

  if (cursorParam) {
    const cursor = decodeCursor(cursorParam)
    if (!cursor) {
      return apiErrorResponse(400, "invalid_request", "Invalid cursor.")
    }
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    )
  }

  const { data, error } = await query
  if (error) {
    console.error("[api/v1/donors] query error:", error.message)
    return apiErrorResponse(500, "internal_error", "Failed to load donors.")
  }

  const rows = (data ?? []) as Array<{ id: string; created_at: string }>
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]

  return jsonList(page, {
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  })
})
