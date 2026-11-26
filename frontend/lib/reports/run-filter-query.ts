import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all"

import type { ValidatedFilterRow } from "./filter-schema"

export type FilterRow = {
  id?: string
  field: string
  operator: string
  value: string | number | string[]
  value2?: string | number
}

export const REPORT_COLUMN_CONFIG: Record<
  string,
  { dbColumns: string[]; label: string }
> = {
  first_name: { dbColumns: ["first_name", "display_name"], label: "First Name" },
  last_name: { dbColumns: ["last_name", "display_name"], label: "Last Name" },
  display_name: { dbColumns: ["display_name"], label: "Display Name" },
  email: { dbColumns: ["email"], label: "Email" },
  phone: { dbColumns: ["phone"], label: "Phone" },
  street_address: { dbColumns: ["billing_address"], label: "Street Address" },
  city: { dbColumns: ["city"], label: "City" },
  state: { dbColumns: ["state"], label: "State" },
  zip: { dbColumns: ["zip"], label: "Zip" },
  mailing_street: { dbColumns: ["mailing_address"], label: "Mailing Street" },
  mailing_city: { dbColumns: ["mailing_city"], label: "Mailing City" },
  mailing_state: { dbColumns: ["mailing_state"], label: "Mailing State" },
  mailing_zip: { dbColumns: ["mailing_zip"], label: "Mailing Zip" },
  lifetime_value: { dbColumns: ["total_lifetime_value"], label: "Donation Amount" },
  donation_date: { dbColumns: ["last_donation_date"], label: "Donation Date" },
  last_gift_date: { dbColumns: ["last_donation_date"], label: "Last Donation Date" },
  last_gift_amount: { dbColumns: ["last_donation_amount"], label: "Last Donation Amount" },
}

export const VALID_COLUMN_IDS = new Set(Object.keys(REPORT_COLUMN_CONFIG))

const DEFAULT_SELECT = "display_name,email,billing_address,total_lifetime_value,last_donation_date"
const MONTH_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_ROWS = 5000

export function buildSelectFromColumns(selectedColumns: string[]): string {
  const set = new Set<string>(["id"])
  for (const id of selectedColumns) {
    const config = REPORT_COLUMN_CONFIG[id]
    if (config) for (const col of config.dbColumns) set.add(col)
  }
  const list = Array.from(set)
  return list.length > 0 ? list.join(",") : DEFAULT_SELECT
}

export function csvCell(value: unknown): string {
  if (value == null) return ""
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function mapRowToOutputColumns(
  raw: Record<string, unknown>,
  selectedColumns: string[]
): Record<string, unknown> {
  const displayName =
    typeof raw.display_name === "string"
      ? raw.display_name.replace(/\s+/g, " ").trim()
      : ""
  const parts = displayName.split(/\s+/).filter(Boolean)
  const derivedFirst = parts.length <= 1 ? parts[0] ?? "" : parts.slice(0, -1).join(" ")
  const derivedLast = parts.length <= 1 ? "" : parts[parts.length - 1] ?? ""

  const out: Record<string, unknown> = {}
  for (const id of selectedColumns) {
    const config = REPORT_COLUMN_CONFIG[id]
    if (!config) continue
    if (id === "first_name") {
      const v = raw.first_name
      out[id] = typeof v === "string" && v.trim() !== "" ? v.trim() : derivedFirst
    } else if (id === "last_name") {
      const v = raw.last_name
      out[id] = typeof v === "string" && v.trim() !== "" ? v.trim() : derivedLast
    } else {
      const dbCol = config.dbColumns[0]
      out[id] = raw[dbCol] ?? ""
    }
  }
  return out
}

export type RunFilterQueryResult = {
  rows: Array<Record<string, unknown>>
  rowCount: number
  /** True if a sub-filter (e.g. tags or payment_method) returned an empty set
   *  before the main query ran. Caller can distinguish "no matches" from "broad miss". */
  emptyByPrefilter: boolean
}

export type RunFilterQueryOptions = {
  orgId: string
  filters: FilterRow[] | ValidatedFilterRow[]
  selectedColumns: string[]
  limit?: number
  /** If false (default), prefilter dead-ends throw. If true, return zero rows. */
  allowEmpty?: boolean
  /** Limit the initial donor fetch (defaults to MAX_ROWS). */
  fetchLimit?: number
}

/**
 * A PostgREST filter builder. Left loose on purpose: the same filters are
 * applied to selects whose row types differ per call.
 */
type DonationFilter = any
type DonorFilter = DonationFilter
type RowPage = PromiseLike<{
  data: Array<Record<string, unknown>> | null
  error: { message: string } | null
}>

class EmptyResultError extends Error {
  constructor(public reason: string) {
    super(reason)
  }
}

/**
 * Execute a filter spec against the donors table and return matching rows.
 * Used by both the manual report builder route and the AI chat tool.
 */
export async function runFilterQuery(
  opts: RunFilterQueryOptions
): Promise<RunFilterQueryResult> {
  const { orgId, filters, selectedColumns, allowEmpty = false } = opts
  const fetchLimit = Math.min(opts.fetchLimit ?? MAX_ROWS, MAX_ROWS)
  const supabase = createAdminClient()

  const selectStr = buildSelectFromColumns(selectedColumns)

  /** Distinct donors of this org with a gift matching `narrow`, paged. */
  const donorIdsWithDonations = async (
    narrow: (q: DonationFilter) => DonationFilter
  ): Promise<string[]> => {
    const rows = await fetchAllRows<{ donor_id: string | null }>((from, to) =>
      narrow(supabase.from("donations").select("donor_id").eq("org_id", orgId))
        .order("id")
        .range(from, to)
    )
    return [...new Set(rows.map((r) => r.donor_id))].filter(
      (id): id is string => typeof id === "string"
    )
  }

  let emptyByPrefilter = false
  const restrictionIdSets: string[][] = []

  // ── Tag prefilter ───────────────────────────────────────────────
  const tagFilter = filters.find((f) => f.field === "tags")
  if (tagFilter && Array.isArray(tagFilter.value) && tagFilter.value.length > 0) {
    const tagIds = tagFilter.value
    // Scoped to the org through the donor join; a tag id alone is not an org boundary.
    const donorTagRows = await fetchAllRows<{ donor_id: string }>((from, to) =>
      supabase
        .from("donor_tags")
        .select("donor_id, donors!inner(org_id)")
        .eq("donors.org_id", orgId)
        .in("tag_id", tagIds)
        .order("donor_id")
        .order("tag_id")
        .range(from, to)
    )
    const ids = [...new Set(donorTagRows.map((r) => r.donor_id))]
    if (ids.length === 0) {
      emptyByPrefilter = true
      if (!allowEmpty) {
        throw new EmptyResultError("No donors match the selected tags.")
      }
    }
    restrictionIdSets.push(ids)
  }

  // ── Payment method prefilter ─────────────────────────────────────
  const paymentMethodFilter = filters.find((f) => f.field === "payment_method")
  if (
    paymentMethodFilter &&
    typeof paymentMethodFilter.value === "string" &&
    paymentMethodFilter.value.trim()
  ) {
    const method = paymentMethodFilter.value.trim()
    const ids = await donorIdsWithDonations((q) => q.eq("payment_method", method))
    if (ids.length === 0) {
      emptyByPrefilter = true
      if (!allowEmpty) {
        throw new EmptyResultError(
          "No donors have donations with that payment method."
        )
      }
    }
    restrictionIdSets.push(ids)
  }

  // ── donation_activity prefilters (new) ───────────────────────────
  const gaveFilters = filters.filter(
    (f) => f.field === "donation_activity" && f.operator === "gave_between"
  )
  const noGiftFilters = filters.filter(
    (f) => f.field === "donation_activity" && f.operator === "no_gift_between"
  )

  for (const f of gaveFilters) {
    const start = String(f.value)
    const end = f.value2 != null ? String(f.value2) : null
    if (!end) continue
    const ids = await donorIdsWithDonations((q) => q.gte("date", start).lte("date", end))
    if (ids.length === 0) {
      emptyByPrefilter = true
      if (!allowEmpty) {
        throw new EmptyResultError(
          `No donors gave between ${start} and ${end}.`
        )
      }
    }
    restrictionIdSets.push(ids)
  }

  // Donor-id restrictions from prefilters (intersected). Applied in id-sized
  // chunks or in memory below — never as one long id list in a request.
  let restrictToIds: string[] | null = null
  if (restrictionIdSets.length > 0) {
    restrictToIds = restrictionIdSets.reduce<string[]>((acc, ids, i) => {
      if (i === 0) return [...ids]
      const set = new Set(ids)
      return acc.filter((id) => set.has(id))
    }, [])
    if (restrictToIds.length === 0) {
      emptyByPrefilter = true
      if (!allowEmpty) {
        throw new EmptyResultError("No donors match the combined filters.")
      }
    }
  }

  // Donors with gifts in any no_gift_between window are dropped after the fetch.
  const excludeIds = new Set<string>()
  for (const f of noGiftFilters) {
    const start = String(f.value)
    const end = f.value2 != null ? String(f.value2) : null
    if (!end) continue
    for (const id of await donorIdsWithDonations((q) => q.gte("date", start).lte("date", end))) {
      excludeIds.add(id)
    }
  }

  // ── Column-level filters, applied to every page of the donor query ──
  const applyColumnFilters = (query: DonorFilter): DonorFilter => {
    let q = query
    for (const f of filters) {
      if (
        f.field === "tags" ||
        f.field === "payment_method" ||
        f.field === "donation_activity" ||
        f.field === "gift_count" ||
        f.field === "first_donation_date"
      ) {
        continue
      }

      if (f.field === "lifecycle_status") {
        const status = String(f.value || "").trim()
        if (!["New", "Active", "Lapsed", "Lost"].includes(status)) continue
        const now = Date.now()
        const sixMo = new Date(now - 6 * MONTH_MS).toISOString().slice(0, 10)
        const twelveMo = new Date(now - 12 * MONTH_MS).toISOString().slice(0, 10)
        const twentyFourMo = new Date(now - 24 * MONTH_MS).toISOString().slice(0, 10)
        if (status === "New") {
          q = q.gte("last_donation_date", sixMo)
        } else if (status === "Active") {
          q = q.lt("last_donation_date", sixMo).gte("last_donation_date", twelveMo)
        } else if (status === "Lapsed") {
          q = q
            .lt("last_donation_date", twelveMo)
            .gte("last_donation_date", twentyFourMo)
        } else {
          q = q.or(
            `last_donation_date.lt.${twentyFourMo},last_donation_date.is.null`
          )
        }
        continue
      }

      const colMap: Record<string, string> = {
        total_lifetime_value: "total_lifetime_value",
        last_donation_amount: "last_donation_amount",
        last_donation_date: "last_donation_date",
        state: "state",
        city: "city",
        zip: "zip",
      }
      const col = colMap[f.field]
      if (!col) continue

      const op = f.operator
      const val = f.value
      const val2 = f.value2

      if (op === "eq") q = q.eq(col, val as string | number)
      else if (op === "gt") q = q.gt(col, val as string | number)
      else if (op === "gte") q = q.gte(col, val as string | number)
      else if (op === "lt") q = q.lt(col, val as string | number)
      else if (op === "lte") q = q.lte(col, val as string | number)
      else if (op === "between" && val2 != null) {
        q = q.gte(col, val as string | number).lte(col, val2 as string | number)
      } else if (op === "contains") q = q.ilike(col, `%${String(val)}%`)
      else if (op === "is_exactly") q = q.eq(col, val as string | number)
      else if (op === "before") q = q.lt(col, String(val))
      else if (op === "after") q = q.gt(col, String(val))
    }
    return q
  }

  // created_at is fetched only to keep rows in the order donors were added
  // (what reports showed before paging); it is stripped again below.
  const donorQuery = () =>
    applyColumnFilters(
      supabase.from("donors").select(`${selectStr},created_at`).eq("org_id", orgId)
    )

  let rawRows: Array<Record<string, unknown>>
  try {
    if (restrictToIds === null) {
      rawRows = await fetchAllRows<Record<string, unknown>>((from, to) =>
        donorQuery().order("created_at").order("id").range(from, to) as unknown as RowPage
      )
    } else {
      rawRows = await fetchAllByIds<Record<string, unknown>>(restrictToIds, (ids, from, to) =>
        donorQuery().in("id", ids).order("id").range(from, to) as unknown as RowPage
      )
    }
  } catch (e) {
    throw new Error(`Failed to execute report query: ${e instanceof Error ? e.message : e}`)
  }
  const wantsCreatedAt = selectStr.split(",").includes("created_at")
  rawRows = rawRows
    .sort(
      (a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) ||
        String(a.id).localeCompare(String(b.id))
    )
    .map((row) => {
      if (wantsCreatedAt) return row
      const { created_at: _createdAt, ...rest } = row
      return rest
    })
  if (excludeIds.size > 0) rawRows = rawRows.filter((r) => !excludeIds.has(r.id as string))
  rawRows = rawRows.slice(0, fetchLimit)

  const rowDonorIds = rawRows
    .map((r) => r.id as string | undefined)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  // ── Post-fetch: gift_count and first_donation_date ──────────────
  const giftCountFilter = filters.find((f) => f.field === "gift_count")
  const firstDateFilter = filters.find((f) => f.field === "first_donation_date")
  if ((giftCountFilter || firstDateFilter) && rowDonorIds.length > 0) {
    const donations = await fetchAllByIds<{ donor_id: string; date: string }>(
      rowDonorIds,
      (ids, from, to) =>
        supabase
          .from("donations")
          .select("donor_id,date")
          .in("donor_id", ids)
          .order("id")
          .range(from, to)
    )
    const countByDonor = new Map<string, number>()
    const firstByDonor = new Map<string, string>()
    for (const r of donations) {
      const did = (r as { donor_id: string; date: string }).donor_id
      const d = (r as { donor_id: string; date: string }).date
      countByDonor.set(did, (countByDonor.get(did) ?? 0) + 1)
      if (d) {
        const cur = firstByDonor.get(did)
        if (!cur || d < cur) firstByDonor.set(did, d)
      }
    }
    let keepIds = new Set(rowDonorIds)
    if (giftCountFilter && giftCountFilter.value != null && giftCountFilter.value !== "") {
      const op = giftCountFilter.operator
      const val = Number(giftCountFilter.value)
      const val2 = giftCountFilter.value2 != null ? Number(giftCountFilter.value2) : null
      keepIds = new Set(
        rowDonorIds.filter((id) => {
          const cnt = countByDonor.get(id) ?? 0
          if (op === "eq") return cnt === val
          if (op === "gt") return cnt > val
          if (op === "gte") return cnt >= val
          if (op === "lt") return cnt < val
          if (op === "lte") return cnt <= val
          if (op === "between" && val2 != null) return cnt >= val && cnt <= val2
          return true
        })
      )
    }
    if (firstDateFilter && firstDateFilter.value != null && firstDateFilter.value !== "") {
      const op = firstDateFilter.operator
      const v = String(firstDateFilter.value)
      const v2 = firstDateFilter.value2 != null ? String(firstDateFilter.value2) : null
      keepIds = new Set(
        [...keepIds].filter((id) => {
          const firstDate = firstByDonor.get(id)
          if (!firstDate) return false
          if (op === "before") return firstDate < v
          if (op === "after") return firstDate > v
          if (op === "between" && v2 != null) return firstDate >= v && firstDate <= v2
          return true
        })
      )
    }
    rawRows = rawRows.filter((r) => keepIds.has(r.id as string))
  }

  // Apply caller-requested limit (after all filtering).
  const limited = opts.limit != null ? rawRows.slice(0, opts.limit) : rawRows

  return { rows: limited, rowCount: rawRows.length, emptyByPrefilter }
}

export { EmptyResultError }
