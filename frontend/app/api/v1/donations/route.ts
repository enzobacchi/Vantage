import { createAdminClient } from "@/lib/supabase/admin"
import {
  decodeCursor,
  encodeCursor,
  jsonList,
  parseLimit,
  withApiV1,
} from "@/lib/api-v1"
import { apiErrorResponse } from "@/lib/api-auth"

// Explicit field list — never select *.
const DONATION_FIELDS =
  "id, donor_id, amount, date, payment_method, category_id, campaign_id, fund_id, memo, source, qb_id, created_at"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/v1/donations?donor_id=&date_from=&date_to=&limit=&cursor=
 *
 * Lists the org's donations, newest first, keyset-paginated.
 */
export const GET = withApiV1(async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const limit = parseLimit(searchParams)
  const donorId = searchParams.get("donor_id")?.trim()
  const dateFrom = searchParams.get("date_from")?.trim()
  const dateTo = searchParams.get("date_to")?.trim()
  const cursorParam = searchParams.get("cursor")?.trim()

  if (donorId && !UUID_RE.test(donorId)) {
    return apiErrorResponse(400, "invalid_request", "Invalid donor_id.")
  }
  if (dateFrom && !DATE_RE.test(dateFrom)) {
    return apiErrorResponse(400, "invalid_request", "date_from must be YYYY-MM-DD.")
  }
  if (dateTo && !DATE_RE.test(dateTo)) {
    return apiErrorResponse(400, "invalid_request", "date_to must be YYYY-MM-DD.")
  }

  const supabase = createAdminClient()
  let query = supabase
    .from("donations")
    .select(DONATION_FIELDS)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)

  if (donorId) query = query.eq("donor_id", donorId)
  if (dateFrom) query = query.gte("date", dateFrom)
  if (dateTo) query = query.lte("date", dateTo)

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
    console.error("[api/v1/donations] query error:", error.message)
    return apiErrorResponse(500, "internal_error", "Failed to load donations.")
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
