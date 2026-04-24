import { tool } from "ai"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"
import { getDonorLifecycleStatus } from "@/lib/donor-lifecycle"
import { computeDonorHealthScore } from "@/lib/donor-score"
import { recalcDonorTotals } from "@/lib/recalc-donor-totals"
import { isLimitExceeded } from "@/lib/subscription"
import {
  DEFAULT_AI_COLUMNS,
  filtersArraySchema,
  type ValidatedFilterRow,
} from "@/lib/reports/filter-schema"
import {
  EmptyResultError,
  REPORT_COLUMN_CONFIG,
  csvCell,
  mapRowToOutputColumns,
  runFilterQuery,
  type FilterRow,
} from "@/lib/reports/run-filter-query"

import type { ChatPIIRedactor } from "./pii-redactor"
import { bucketDate, enumerateBuckets, type Interval } from "./timeseries"

const GROUP_DIMS = [
  "campaign",
  "fund",
  "lifecycle",
  "donor_type",
  "payment_method",
  "state",
] as const
type GroupDim = (typeof GROUP_DIMS)[number]

const INTERVALS = ["day", "week", "month", "quarter", "year"] as const

type DonationRow = {
  amount: number | string | null
  date: string
  donor_id: string
  payment_method?: string | null
  campaign_id?: string | null
  fund_id?: string | null
}

type DonorRow = {
  id: string
  donor_type?: string | null
  state?: string | null
  last_donation_date?: string | null
  total_lifetime_value?: number | null
}

const roundCents = (n: number) => Math.round(n * 100) / 100

type MetricKey = "revenue" | "donor_count" | "gift_count" | "avg_gift"

function pickMetric(
  agg: { revenue: number; gift_count: number; donors: Set<string> },
  metric: MetricKey
): number {
  switch (metric) {
    case "revenue":
      return agg.revenue
    case "donor_count":
      return agg.donors.size
    case "gift_count":
      return agg.gift_count
    case "avg_gift":
      return agg.gift_count > 0 ? agg.revenue / agg.gift_count : 0
  }
}

export function buildTools(
  orgId: string,
  userId: string,
  redactor?: ChatPIIRedactor
) {
  const supabase = createAdminClient()

  /**
   * Fetch donations in a date range plus the columns needed to group or
   * bucket them later. Single source of truth for the analytics tools.
   *
   * Paginates via .range() — PostgREST caps a single .select() at 1000 rows
   * by default. Without pagination, any org with more than 1000 donations
   * silently undercounts revenue/gift_count/donor_count.
   */
  async function fetchDonationsInRange(
    fromDate?: string,
    toDate?: string
  ): Promise<DonationRow[]> {
    const PAGE = 1000
    const all: DonationRow[] = []
    for (let offset = 0; ; offset += PAGE) {
      let q = supabase
        .from("donations")
        .select("amount,date,donor_id,payment_method,campaign_id,fund_id")
        .eq("org_id", orgId)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (fromDate) q = q.gte("date", fromDate)
      if (toDate) q = q.lte("date", toDate)
      const { data, error } = await q
      if (error) {
        console.error("[tools] fetchDonationsInRange:", error.message)
        break
      }
      const page = (data ?? []) as DonationRow[]
      all.push(...page)
      if (page.length < PAGE) break
    }
    return all
  }

  /**
   * Build a `donor_id -> DonorRow` map for a set of donor IDs. Used by
   * analytics tools that group by lifecycle, donor_type, or state.
   */
  async function fetchDonorMap(
    donorIds: string[]
  ): Promise<Map<string, DonorRow>> {
    const map = new Map<string, DonorRow>()
    if (donorIds.length === 0) return map
    // PostgREST caps at 1000 rows per query — chunk the id list so large
    // donor sets don't get silently truncated.
    const CHUNK = 500
    for (let i = 0; i < donorIds.length; i += CHUNK) {
      const slice = donorIds.slice(i, i + CHUNK)
      const { data } = await supabase
        .from("donors")
        .select("id,donor_type,state,last_donation_date,total_lifetime_value")
        .eq("org_id", orgId)
        .in("id", slice)
      for (const d of (data ?? []) as DonorRow[]) map.set(d.id, d)
    }
    return map
  }

  /**
   * Resolve `campaign_id`/`fund_id` values referenced in a batch of donations
   * to human-readable names. Returns an id → name map.
   */
  async function fetchOptionNames(
    rows: DonationRow[],
    groupBy: GroupDim | undefined
  ): Promise<Record<string, string>> {
    if (groupBy !== "campaign" && groupBy !== "fund") return {}
    const idKey = groupBy === "campaign" ? "campaign_id" : "fund_id"
    const ids = [
      ...new Set(
        rows
          .map((r) => r[idKey] as string | null | undefined)
          .filter((v): v is string => !!v)
      ),
    ]
    if (ids.length === 0) return {}
    const table = groupBy === "campaign" ? "gift_campaigns" : "gift_funds"
    const { data } = await supabase
      .from(table)
      .select("id,name")
      .in("id", ids)
    const out: Record<string, string> = {}
    for (const o of (data ?? []) as { id: string; name: string | null }[]) {
      out[o.id] = o.name ?? ""
    }
    return out
  }

  /**
   * Return the group-key for a donation row given a grouping dimension.
   * Unknown / missing values are bucketed as "Uncategorized".
   */
  function groupKeyFor(
    row: DonationRow,
    groupBy: GroupDim,
    donorMap: Map<string, DonorRow>,
    optionNames: Record<string, string>
  ): string {
    switch (groupBy) {
      case "campaign":
        return row.campaign_id ? optionNames[row.campaign_id] || "Uncategorized" : "Uncategorized"
      case "fund":
        return row.fund_id ? optionNames[row.fund_id] || "Uncategorized" : "Uncategorized"
      case "payment_method":
        return row.payment_method || "unknown"
      case "lifecycle": {
        const d = donorMap.get(row.donor_id)
        return d ? getDonorLifecycleStatus(d).status : "Unknown"
      }
      case "donor_type": {
        const d = donorMap.get(row.donor_id)
        return d?.donor_type || "unknown"
      }
      case "state": {
        const d = donorMap.get(row.donor_id)
        return d?.state || "Unknown"
      }
    }
  }

  type PeriodTotals = {
    total_revenue: number
    gift_count: number
    donor_count: number
    average_gift: number
    donor_ids: Set<string>
  }

  function computePeriodTotals(rows: DonationRow[]): PeriodTotals {
    const donorIds = new Set<string>()
    let total = 0
    for (const r of rows) {
      total += Number(r.amount ?? 0)
      donorIds.add(r.donor_id)
    }
    return {
      total_revenue: roundCents(total),
      gift_count: rows.length,
      donor_count: donorIds.size,
      average_gift: rows.length > 0 ? roundCents(total / rows.length) : 0,
      donor_ids: donorIds,
    }
  }

  const rawTools = {
    search_donors: tool({
      description:
        "Search and list donors. Use this for questions like 'who are my top donors', 'show me donors', 'list donors'. Returns donor profiles with IDs, names, lifetime giving, location, and lifecycle status. Results are sorted by lifetime giving (highest first) by default.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Name search (partial match)"),
        lifecycle_status: z
          .enum(["New", "Active", "Lapsed", "Lost"])
          .optional()
          .describe("Filter by computed lifecycle status"),
        donor_type: z
          .enum(["individual", "corporate", "school", "church"])
          .optional()
          .describe("Filter by donor type"),
        min_lifetime_value: z
          .number()
          .optional()
          .describe("Minimum lifetime giving amount"),
        max_lifetime_value: z
          .number()
          .optional()
          .describe("Maximum lifetime giving amount"),
        limit: z
          .number()
          .min(1)
          .max(25)
          .optional()
          .describe("Max results to return (default 10)"),
      }),
      execute: async ({
        query,
        lifecycle_status,
        donor_type,
        min_lifetime_value,
        max_lifetime_value,
        limit = 10,
      }) => {
        let q = supabase
          .from("donors")
          .select(
            "id,display_name,donor_type,total_lifetime_value,last_donation_date,city,state"
          )
          .eq("org_id", orgId)
          .order("total_lifetime_value", {
            ascending: false,
            nullsFirst: false,
          })

        if (query?.trim()) {
          q = q.ilike("display_name", `%${query.trim()}%`)
        }
        if (donor_type) {
          q = q.eq("donor_type", donor_type)
        }
        if (min_lifetime_value != null) {
          q = q.gte("total_lifetime_value", min_lifetime_value)
        }
        if (max_lifetime_value != null) {
          q = q.lte("total_lifetime_value", max_lifetime_value)
        }

        // Fetch more than needed if filtering by lifecycle (computed in-memory)
        const fetchLimit = lifecycle_status ? 200 : limit
        q = q.limit(fetchLimit)

        const { data, error } = await q
        if (error) return { error: "Failed to search donors." }

        let donors = (data ?? []).map((d) => {
          const lc = getDonorLifecycleStatus(d)
          return {
            id: d.id,
            display_name: d.display_name,
            donor_type: d.donor_type,
            total_lifetime_value: d.total_lifetime_value,
            last_donation_date: d.last_donation_date,
            lifecycle_status: lc.status,
            is_major_donor: lc.isMajor,
            city: d.city,
            state: d.state,
          }
        })

        if (lifecycle_status) {
          donors = donors.filter((d) => d.lifecycle_status === lifecycle_status)
        }

        return { donors: donors.slice(0, limit), total_found: donors.length }
      },
    }),

    get_donor_summary: tool({
      description:
        "Get a detailed summary of a specific donor including their profile, recent donations, interactions, tags, and opportunities.",
      inputSchema: z.object({
        donor_id: z.string().describe("The donor's ID"),
      }),
      execute: async ({ donor_id }) => {
        const [donorRes, donationsRes, interactionsRes, tagsRes, oppsRes] =
          await Promise.all([
            // Only select fields needed for the summary — never fetch email/phone/address
            supabase
              .from("donors")
              .select("id,display_name,donor_type,city,state,total_lifetime_value,last_donation_date,last_donation_amount,notes")
              .eq("id", donor_id)
              .eq("org_id", orgId)
              .single(),
            supabase
              .from("donations")
              .select("id,amount,date,memo,payment_method")
              .eq("donor_id", donor_id)
              .eq("org_id", orgId)
              .order("date", { ascending: false, nullsFirst: false })
              .limit(10),
            supabase
              .from("interactions")
              .select(
                "id,type,direction,subject,date,status,donors!inner(org_id)"
              )
              .eq("donor_id", donor_id)
              .eq("donors.org_id", orgId)
              .order("date", { ascending: false })
              .limit(10),
            supabase
              .from("donor_tags")
              .select("tags(name)")
              .eq("donor_id", donor_id),
            supabase
              .from("opportunities")
              .select("id,title,amount,status,expected_date")
              .eq("donor_id", donor_id)
              .eq("organization_id", orgId)
              .order("created_at", { ascending: false })
              .limit(5),
          ])

        if (donorRes.error || !donorRes.data) {
          return { error: "Donor not found." }
        }

        const donor = donorRes.data
        const lc = getDonorLifecycleStatus(donor)

        return {
          profile: {
            display_name: donor.display_name,
            donor_type: donor.donor_type,
            city: donor.city,
            state: donor.state,
            total_lifetime_value: donor.total_lifetime_value,
            last_donation_date: donor.last_donation_date,
            lifecycle_status: lc.status,
            is_major_donor: lc.isMajor,
          },
          recent_donations: (donationsRes.data ?? []).map((d) => ({
            amount: d.amount,
            date: d.date,
            payment_method: d.payment_method,
          })),
          recent_interactions: (interactionsRes.data ?? []).map((i) => ({
            type: i.type,
            direction: i.direction,
            subject: i.subject,
            date: i.date,
            status: i.status,
          })),
          tags: (tagsRes.data ?? [])
            .map((t) => {
              const tag = t.tags as unknown as { name: string } | null
              return tag?.name
            })
            .filter(Boolean),
          opportunities: (oppsRes.data ?? []).map((o) => ({
            title: o.title,
            amount: o.amount,
            status: o.status,
            expected_date: o.expected_date,
          })),
        }
      },
    }),

    get_donation_metrics: tool({
      description:
        "Get aggregate donation statistics for a single date range: total revenue, average gift, donor counts, and optional breakdowns by dimension. Use for summary questions like 'how much did we raise', 'what are our metrics', or 'revenue by campaign last quarter'. For two-window comparisons (Q1 vs Q2, YoY) use compare_periods. For charting over time use get_donation_timeseries. Do NOT use this to list individual donors — use search_donors instead.",
      inputSchema: z.object({
        from_date: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD, inclusive)"),
        to_date: z
          .string()
          .optional()
          .describe("End date (YYYY-MM-DD, inclusive)"),
        group_by: z
          .enum(GROUP_DIMS)
          .optional()
          .describe(
            "Dimension to break totals down by: campaign, fund, lifecycle, donor_type, payment_method, or state"
          ),
      }),
      execute: async ({ from_date, to_date, group_by }) => {
        // Headline "what are my donation metrics?" — no date, no grouping.
        // Match the dashboard: sum donors.total_lifetime_value, count donor
        // rows. The donations table can lag the cached lifetime totals, so
        // using it here diverges from the numbers the user sees on the home
        // screen. Grouping/date-ranged queries still need the donations path.
        if (!from_date && !to_date && !group_by) {
          const PAGE = 1000
          const donors: DonorRow[] = []
          let totalCount: number | null = null
          for (let offset = 0; ; offset += PAGE) {
            const { data, count, error } = await supabase
              .from("donors")
              .select(
                "id,donor_type,state,last_donation_date,total_lifetime_value",
                { count: offset === 0 ? "exact" : undefined }
              )
              .eq("org_id", orgId)
              .order("id", { ascending: true })
              .range(offset, offset + PAGE - 1)
            if (error) {
              console.error("[tools] donors fetch:", error.message)
              break
            }
            if (offset === 0) totalCount = count ?? null
            const page = (data ?? []) as DonorRow[]
            donors.push(...page)
            if (page.length < PAGE) break
          }
          const totalDonors = totalCount ?? donors.length
          const totalRevenue = roundCents(
            donors.reduce((sum, d) => sum + Number(d.total_lifetime_value ?? 0), 0)
          )
          const lifecycleCounts: Record<string, number> = {}
          const typeCounts: Record<string, number> = {}
          for (const d of donors) {
            const lc = getDonorLifecycleStatus(d)
            lifecycleCounts[lc.status] = (lifecycleCounts[lc.status] ?? 0) + 1
            if (d.donor_type) {
              typeCounts[d.donor_type] = (typeCounts[d.donor_type] ?? 0) + 1
            }
          }
          return {
            total_count: null,
            total_revenue: totalRevenue,
            average_gift: totalDonors > 0 ? roundCents(totalRevenue / totalDonors) : 0,
            unique_donor_count: totalDonors,
            donors_by_lifecycle: lifecycleCounts,
            donors_by_type: typeCounts,
            source: "donors.total_lifetime_value",
          }
        }

        const rows = await fetchDonationsInRange(from_date, to_date)
        const totals = computePeriodTotals(rows)

        // Per-donor counts (lifecycle + type) are always returned — they
        // power the existing KPI card regardless of group_by.
        const donorMap = await fetchDonorMap([...totals.donor_ids])
        const lifecycleCounts: Record<string, number> = {}
        const typeCounts: Record<string, number> = {}
        for (const d of donorMap.values()) {
          const lc = getDonorLifecycleStatus(d)
          lifecycleCounts[lc.status] = (lifecycleCounts[lc.status] ?? 0) + 1
          if (d.donor_type) {
            typeCounts[d.donor_type] = (typeCounts[d.donor_type] ?? 0) + 1
          }
        }

        // Optional dimensional breakdown. Cap to top 10 groups so the model
        // doesn't try to narrate 50 campaigns and blow past the token limit.
        const BREAKDOWN_LIMIT = 10
        let breakdown:
          | Array<{
              group: string
              total: number
              gift_count: number
              donor_count: number
            }>
          | undefined
        let totalGroups = 0
        let truncated = false
        if (group_by) {
          const optionNames = await fetchOptionNames(rows, group_by)
          const agg: Record<
            string,
            { total: number; gifts: number; donors: Set<string> }
          > = {}
          for (const r of rows) {
            const key = groupKeyFor(r, group_by, donorMap, optionNames)
            agg[key] ||= { total: 0, gifts: 0, donors: new Set() }
            agg[key].total += Number(r.amount ?? 0)
            agg[key].gifts++
            agg[key].donors.add(r.donor_id)
          }
          const all = Object.entries(agg)
            .map(([group, v]) => ({
              group,
              total: roundCents(v.total),
              gift_count: v.gifts,
              donor_count: v.donors.size,
            }))
            .sort((a, b) => b.total - a.total)
          totalGroups = all.length
          truncated = all.length > BREAKDOWN_LIMIT
          breakdown = all.slice(0, BREAKDOWN_LIMIT)
        }

        return {
          total_count: totals.gift_count,
          total_revenue: totals.total_revenue,
          average_gift: totals.average_gift,
          unique_donor_count: totals.donor_count,
          donors_by_lifecycle: lifecycleCounts,
          donors_by_type: typeCounts,
          ...(breakdown && {
            group_by,
            breakdown,
            total_groups: totalGroups,
            truncated,
          }),
        }
      },
    }),

    compare_periods: tool({
      description:
        "Compare donation metrics between two date ranges. Use for 'Q1 vs Q2', 'this month vs last month', 'YoY by campaign', or 'how did we do compared to last year'. Returns totals for each period, percent deltas, optional group breakdowns, and optional retention (which donors gave in both windows). Do NOT use this for single-period metrics — use get_donation_metrics.",
      inputSchema: z.object({
        period_a: z
          .object({
            from: z.string().describe("Start date (YYYY-MM-DD)"),
            to: z.string().describe("End date (YYYY-MM-DD)"),
            label: z
              .string()
              .optional()
              .describe("Display label, e.g. 'Q1 2025'"),
          })
          .describe("First period to compare"),
        period_b: z
          .object({
            from: z.string().describe("Start date (YYYY-MM-DD)"),
            to: z.string().describe("End date (YYYY-MM-DD)"),
            label: z.string().optional().describe("Display label"),
          })
          .describe("Second period to compare"),
        group_by: z
          .enum(GROUP_DIMS)
          .optional()
          .describe("Optional per-group comparison"),
        include_retention: z
          .boolean()
          .optional()
          .describe(
            "Include retained_donors / new_in_b / lost donor counts (donor overlap across the two windows)"
          ),
      }),
      execute: async ({
        period_a,
        period_b,
        group_by,
        include_retention,
      }) => {
        const [rowsA, rowsB] = await Promise.all([
          fetchDonationsInRange(period_a.from, period_a.to),
          fetchDonationsInRange(period_b.from, period_b.to),
        ])
        const a = computePeriodTotals(rowsA)
        const b = computePeriodTotals(rowsB)

        const pctDelta = (before: number, after: number): number | null => {
          if (before === 0) return after === 0 ? 0 : null
          return Math.round(((after - before) / before) * 1000) / 10
        }

        const out: Record<string, unknown> = {
          a: {
            label: period_a.label ?? `${period_a.from} → ${period_a.to}`,
            from: period_a.from,
            to: period_a.to,
            total_revenue: a.total_revenue,
            gift_count: a.gift_count,
            donor_count: a.donor_count,
            average_gift: a.average_gift,
          },
          b: {
            label: period_b.label ?? `${period_b.from} → ${period_b.to}`,
            from: period_b.from,
            to: period_b.to,
            total_revenue: b.total_revenue,
            gift_count: b.gift_count,
            donor_count: b.donor_count,
            average_gift: b.average_gift,
          },
          delta: {
            total_revenue_pct: pctDelta(a.total_revenue, b.total_revenue),
            gift_count_pct: pctDelta(a.gift_count, b.gift_count),
            donor_count_pct: pctDelta(a.donor_count, b.donor_count),
            average_gift_pct: pctDelta(a.average_gift, b.average_gift),
            total_revenue_abs: roundCents(b.total_revenue - a.total_revenue),
          },
        }

        if (group_by) {
          const allDonorIds = [
            ...new Set([...a.donor_ids, ...b.donor_ids]),
          ]
          const donorMap = await fetchDonorMap(allDonorIds)
          const optionNames = await fetchOptionNames(
            [...rowsA, ...rowsB],
            group_by
          )
          const groups = new Set<string>()
          const sum = (rows: DonationRow[]) => {
            const agg: Record<string, number> = {}
            for (const r of rows) {
              const key = groupKeyFor(r, group_by, donorMap, optionNames)
              groups.add(key)
              agg[key] = (agg[key] ?? 0) + Number(r.amount ?? 0)
            }
            return agg
          }
          const aAgg = sum(rowsA)
          const bAgg = sum(rowsB)
          out.by_group = [...groups]
            .map((g) => ({
              group: g,
              a: roundCents(aAgg[g] ?? 0),
              b: roundCents(bAgg[g] ?? 0),
              delta_pct: pctDelta(aAgg[g] ?? 0, bAgg[g] ?? 0),
            }))
            .sort((x, y) => y.b - x.b)
          out.group_by = group_by
        }

        if (include_retention) {
          const retained = [...a.donor_ids].filter((id) =>
            b.donor_ids.has(id)
          ).length
          const newInB = [...b.donor_ids].filter(
            (id) => !a.donor_ids.has(id)
          ).length
          const lost = [...a.donor_ids].filter(
            (id) => !b.donor_ids.has(id)
          ).length
          out.retention = {
            retained_donors: retained,
            new_donors_in_b: newInB,
            lost_donors: lost,
            retention_rate_pct:
              a.donor_count > 0
                ? Math.round((retained / a.donor_count) * 1000) / 10
                : null,
          }
        }

        return out
      },
    }),

    get_donation_timeseries: tool({
      description:
        "Return donation metrics bucketed over time for charting. Use for 'monthly donations this year', 'weekly giving trend', 'revenue by month by campaign', or anything that should render as a line/bar chart. For a single-number answer use get_donation_metrics. For two-period comparisons use compare_periods.",
      inputSchema: z.object({
        from_date: z.string().describe("Start date (YYYY-MM-DD)"),
        to_date: z.string().describe("End date (YYYY-MM-DD)"),
        interval: z
          .enum(INTERVALS)
          .describe("Bucket size: day, week, month, quarter, or year"),
        group_by: z
          .enum(GROUP_DIMS)
          .optional()
          .describe(
            "Optional dimension to split into parallel series (renders as stacked bars)"
          ),
        metric: z
          .enum(["revenue", "donor_count", "gift_count", "avg_gift"])
          .optional()
          .describe("Which metric to chart (default: revenue)"),
      }),
      execute: async ({
        from_date,
        to_date,
        interval,
        group_by,
        metric = "revenue",
      }) => {
        const rows = await fetchDonationsInRange(from_date, to_date)
        const buckets = enumerateBuckets(
          from_date,
          to_date,
          interval as Interval
        )

        let donorMap = new Map<string, DonorRow>()
        let optionNames: Record<string, string> = {}
        if (group_by) {
          const uniqueDonorIds = [...new Set(rows.map((r) => r.donor_id))]
          ;[donorMap, optionNames] = await Promise.all([
            fetchDonorMap(uniqueDonorIds),
            fetchOptionNames(rows, group_by),
          ])
        }

        type Agg = {
          revenue: number
          gift_count: number
          donors: Set<string>
        }
        const emptyAgg = (): Agg => ({
          revenue: 0,
          gift_count: 0,
          donors: new Set(),
        })
        const byBucket = new Map<string, Map<string, Agg>>()
        const groupSet = new Set<string>()

        for (const b of buckets) byBucket.set(b, new Map())

        for (const r of rows) {
          const bucket = bucketDate(r.date, interval as Interval)
          if (!bucket) continue
          const groupKey = group_by
            ? groupKeyFor(r, group_by, donorMap, optionNames)
            : "total"
          groupSet.add(groupKey)
          const bucketMap = byBucket.get(bucket) ?? new Map<string, Agg>()
          const agg = bucketMap.get(groupKey) ?? emptyAgg()
          agg.revenue += Number(r.amount ?? 0)
          agg.gift_count += 1
          agg.donors.add(r.donor_id)
          bucketMap.set(groupKey, agg)
          byBucket.set(bucket, bucketMap)
        }

        const groups = [...groupSet].sort()
        const series = buckets.map((b) => {
          const row: Record<string, number | string> = { bucket: b }
          let totalMetric = 0
          for (const g of groups) {
            const agg = byBucket.get(b)?.get(g)
            const value = agg ? pickMetric(agg, metric) : 0
            row[g] = roundCents(value)
            totalMetric += value
          }
          row.total = roundCents(totalMetric)
          return row
        })

        return {
          interval,
          metric,
          group_by: group_by ?? null,
          groups,
          series,
          total_revenue: roundCents(
            rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
          ),
          total_gifts: rows.length,
        }
      },
    }),

    filter_donations: tool({
      description:
        "Search individual donation transaction records. Use this when the user asks about specific gifts, donation amounts, or payment details. Do NOT use this to find 'top donors' — use search_donors instead.",
      inputSchema: z.object({
        donor_id: z
          .string()
          .optional()
          .describe("Filter to a specific donor"),
        from_date: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD)"),
        to_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
        min_amount: z.number().optional().describe("Minimum donation amount"),
        max_amount: z.number().optional().describe("Maximum donation amount"),
        payment_method: z
          .string()
          .optional()
          .describe(
            "Payment method filter (check, cash, zelle, wire, venmo, daf, other, quickbooks)"
          ),
        campaign_name: z
          .string()
          .optional()
          .describe("Campaign name (partial match)"),
        fund_name: z
          .string()
          .optional()
          .describe("Fund name (partial match)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default 20)"),
      }),
      execute: async ({
        donor_id,
        from_date,
        to_date,
        min_amount,
        max_amount,
        payment_method,
        campaign_name,
        fund_name,
        limit = 20,
      }) => {
        let q = supabase
          .from("donations")
          .select(
            "id,donor_id,amount,date,memo,payment_method,category_id,campaign_id,fund_id,donors(id,display_name)"
          )
          .eq("org_id", orgId)
          .order("date", { ascending: false, nullsFirst: false })
          .limit(limit)

        if (donor_id) q = q.eq("donor_id", donor_id)
        if (from_date) q = q.gte("date", from_date)
        if (to_date) q = q.lte("date", to_date)
        if (min_amount != null) q = q.gte("amount", min_amount)
        if (max_amount != null) q = q.lte("amount", max_amount)
        if (payment_method) q = q.eq("payment_method", payment_method)

        const { data, error } = await q
        if (error) return { error: "Failed to search donations." }

        const rows = data ?? []

        // Resolve campaign/fund names
        const optionIds = new Set<string>()
        rows.forEach((r: Record<string, unknown>) => {
          if (r.campaign_id) optionIds.add(r.campaign_id as string)
          if (r.fund_id) optionIds.add(r.fund_id as string)
          if (r.category_id) optionIds.add(r.category_id as string)
        })

        const optionNames: Record<string, string> = {}
        if (optionIds.size > 0) {
          const ids = [...optionIds]
          const [cats, camps, funds] = await Promise.all([
            supabase
              .from("gift_categories")
              .select("id,name")
              .in("id", ids),
            supabase
              .from("gift_campaigns")
              .select("id,name")
              .in("id", ids),
            supabase.from("gift_funds").select("id,name").in("id", ids),
          ])
          for (const o of [
            ...(cats.data ?? []),
            ...(camps.data ?? []),
            ...(funds.data ?? []),
          ]) {
            optionNames[o.id] = o.name ?? ""
          }
        }

        let donations = rows.map((r: Record<string, unknown>) => {
          const donors = r.donors as {
            id?: string | null
            display_name?: string | null
          } | null
          return {
            donor_id: (r.donor_id as string) ?? donors?.id ?? null,
            donor_name: donors?.display_name ?? "Unknown",
            amount: Number(r.amount) || 0,
            date: r.date as string | null,
            payment_method: (r.payment_method as string) || "other",
            campaign_name: r.campaign_id
              ? optionNames[r.campaign_id as string] ?? null
              : null,
            fund_name: r.fund_id
              ? optionNames[r.fund_id as string] ?? null
              : null,
            category_name: r.category_id
              ? optionNames[r.category_id as string] ?? null
              : null,
          }
        })

        // Client-side filter by campaign/fund name if requested
        if (campaign_name) {
          const lower = campaign_name.toLowerCase()
          donations = donations.filter(
            (d) =>
              d.campaign_name &&
              d.campaign_name.toLowerCase().includes(lower)
          )
        }
        if (fund_name) {
          const lower = fund_name.toLowerCase()
          donations = donations.filter(
            (d) =>
              d.fund_name && d.fund_name.toLowerCase().includes(lower)
          )
        }

        return { donations, total_found: donations.length }
      },
    }),

    create_donor: tool({
      description:
        "Create a new donor in the CRM. Use this when a user mentions someone who isn't in the system yet. You should first search_donors to confirm they don't already exist. Only required field is display_name — collect other details if the user provides them, but don't block on optional fields.",
      inputSchema: z.object({
        display_name: z.string().describe("Full name of the donor"),
        email: z.string().optional().describe("Email address"),
        phone: z.string().optional().describe("Phone number"),
        billing_address: z.string().optional().describe("Street address"),
        city: z.string().optional().describe("City"),
        state: z.string().optional().describe("State abbreviation (e.g. CA, TX)"),
        zip: z.string().optional().describe("ZIP code"),
        donor_type: z
          .enum(["individual", "corporate", "school", "church"])
          .optional()
          .describe("Type of donor (default: individual)"),
      }),
      execute: async ({ display_name, email, phone, billing_address, city, state, zip, donor_type }) => {
        const name = display_name.trim()
        if (!name) return { error: "Display name is required." }

        // Check for duplicates
        const { data: existing } = await supabase
          .from("donors")
          .select("id,display_name")
          .eq("org_id", orgId)
          .ilike("display_name", name)
          .limit(3)

        if (existing && existing.length > 0) {
          return {
            warning: "Possible duplicate donors found",
            existing_donors: existing.map((d) => ({ id: d.id, display_name: d.display_name })),
            message: "A donor with a similar name already exists. Please confirm if you want to create a new donor or use the existing one.",
          }
        }

        // Enforce donor limit
        if (await isLimitExceeded(orgId, "donors")) {
          return {
            error: "Donor limit reached",
            message: "You've reached your donor limit. Please upgrade your plan to add more donors.",
          }
        }

        const { data, error: insertErr } = await supabase
          .from("donors")
          .insert({
            org_id: orgId,
            display_name: name,
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            billing_address: billing_address?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            zip: zip?.trim() || null,
            donor_type: donor_type || "individual",
            total_lifetime_value: 0,
            last_donation_date: null,
            last_donation_amount: null,
          })
          .select("id,display_name")
          .single()

        if (insertErr) return { error: `Failed to create donor: ${insertErr.message}` }

        return {
          success: true,
          donor_id: data.id,
          display_name: data.display_name,
          message: `Created new donor "${data.display_name}".`,
        }
      },
    }),

    create_donation: tool({
      description:
        "Create a new donation for a donor. The AI must first search for the donor to get their ID, then confirm the details with the user before calling this tool. Always confirm amount, donor, date, and payment method before creating.",
      inputSchema: z.object({
        donor_id: z.string().describe("The donor's ID (look up via search_donors first)"),
        amount: z.number().positive().describe("Donation amount in dollars"),
        date: z
          .string()
          .describe("Donation date in YYYY-MM-DD format. Use today's date if not specified."),
        payment_method: z
          .enum(["check", "cash", "zelle", "wire", "venmo", "daf", "other"])
          .describe("Payment method"),
        memo: z.string().optional().describe("Optional memo or note about the donation"),
      }),
      execute: async ({ donor_id, amount, date, payment_method, memo }) => {
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { error: "Date must be in YYYY-MM-DD format." }
        }

        // Verify donor belongs to this org
        const { data: donor, error: donorErr } = await supabase
          .from("donors")
          .select("id,display_name")
          .eq("id", donor_id)
          .eq("org_id", orgId)
          .maybeSingle()

        if (donorErr || !donor) {
          return { error: "Donor not found in your organization." }
        }

        // Insert the donation
        const { data: donation, error: insertErr } = await supabase
          .from("donations")
          .insert({
            org_id: orgId,
            donor_id,
            amount,
            date,
            payment_method,
            memo: memo?.trim() || null,
            source: "manual",
          })
          .select("id")
          .single()

        if (insertErr) {
          return { error: `Failed to create donation: ${insertErr.message}` }
        }

        // Recalculate donor totals
        await recalcDonorTotals(supabase, donor_id)

        return {
          success: true,
          donation_id: donation.id,
          donor_name: donor.display_name,
          amount,
          date,
          payment_method,
        }
      },
    }),

    get_recent_activity: tool({
      description:
        "Get recent interactions/touchpoints (emails, calls, meetings, notes, tasks) across all donors.",
      inputSchema: z.object({
        type: z
          .enum(["email", "call", "meeting", "note", "task"])
          .optional()
          .describe("Filter by interaction type"),
        limit: z
          .number()
          .min(1)
          .max(30)
          .optional()
          .describe("Max results (default 15)"),
      }),
      execute: async ({ type, limit = 15 }) => {
        let q = supabase
          .from("interactions")
          .select(
            "id,type,direction,subject,date,status,donors!inner(display_name,org_id)"
          )
          .eq("donors.org_id", orgId)
          .order("date", { ascending: false })
          .limit(limit)

        if (type) q = q.eq("type", type)

        const { data, error } = await q
        if (error) return { error: "Failed to load recent activity." }

        const activities = (data ?? []).map(
          (i: Record<string, unknown>) => {
            const donors = i.donors as {
              display_name?: string | null
            } | null
            return {
              donor_name: donors?.display_name ?? "Unknown",
              type: i.type,
              direction: i.direction,
              subject: i.subject,
              date: i.date,
              status: i.status,
            }
          }
        )

        return { activities, total_found: activities.length }
      },
    }),

    get_donor_locations: tool({
      description:
        "Get a geographic breakdown of where donors are located. Returns counts by state and city. Use this when asked about donor locations, geography, or where donors are concentrated.",
      inputSchema: z.object({
        group_by: z
          .enum(["state", "city"])
          .optional()
          .describe("Group by state or city (default: state)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default 20)"),
      }),
      execute: async ({ group_by = "state", limit = 20 }) => {
        const { data, error } = await supabase
          .from("donors")
          .select("id,display_name,city,state")
          .eq("org_id", orgId)
          .not(group_by === "city" ? "city" : "state", "is", null)

        if (error) return { error: "Failed to load donor locations." }

        const rows = data ?? []

        // Group and count
        const counts: Record<string, { count: number; donors: { id: string; name: string }[] }> = {}
        for (const d of rows) {
          const key = group_by === "city"
            ? `${d.city ?? "Unknown"}, ${d.state ?? ""}`
            : (d.state ?? "Unknown")
          if (!counts[key]) counts[key] = { count: 0, donors: [] }
          counts[key].count++
          if (counts[key].donors.length < 3) {
            counts[key].donors.push({ id: d.id, name: d.display_name ?? "Unknown" })
          }
        }

        // Sort by count descending
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, limit)
          .map(([location, info]) => ({
            location,
            donor_count: info.count,
            sample_donors: info.donors,
          }))

        return {
          total_donors_with_location: rows.length,
          locations: sorted,
        }
      },
    }),

    get_donor_health_score: tool({
      description:
        "Get the health score (0-100) for a specific donor. Returns the score, label (Excellent/Good/Fair/At Risk/Cold), factor breakdown (recency, frequency, monetary trend, engagement, consistency), giving trend, and a suggested ask amount. Use this when asked about donor health, engagement, or 'how is this donor doing'.",
      inputSchema: z.object({
        donor_id: z.string().describe("The donor's ID"),
      }),
      execute: async ({ donor_id }) => {
        const { data: donor, error: donorErr } = await supabase
          .from("donors")
          .select("id,display_name,total_lifetime_value,last_donation_date")
          .eq("id", donor_id)
          .eq("org_id", orgId)
          .single()

        if (donorErr || !donor) return { error: "Donor not found." }

        const [donationsRes, interactionsRes] = await Promise.all([
          supabase
            .from("donations")
            .select("amount,date")
            .eq("donor_id", donor_id)
            .eq("org_id", orgId)
            .order("date", { ascending: true }),
          supabase
            .from("interactions")
            .select("date,type")
            .eq("donor_id", donor_id)
            .order("date", { ascending: true }),
        ])

        const donationsList = donationsRes.data ?? []

        const score = computeDonorHealthScore({
          lastDonationDate: donor.last_donation_date ?? null,
          firstDonationDate: donationsList.length > 0 ? donationsList[0].date : null,
          totalLifetimeValue: Number(donor.total_lifetime_value ?? 0),
          donations: donationsList.map((d) => ({ amount: d.amount, date: d.date })),
          interactions: (interactionsRes.data ?? []).map((i) => ({ date: i.date, type: i.type })),
        })

        return {
          donor_name: donor.display_name,
          health_score: score.score,
          label: score.label,
          trend: score.trend,
          suggested_ask: score.suggestedAsk,
          factors: score.factors,
        }
      },
    }),

    get_at_risk_donors: tool({
      description:
        "Find donors who are at risk of lapsing. Returns donors with low health scores who have meaningful giving history. Use this when asked about 'at risk donors', 'who might we lose', 'lapsing donors', or 'donor retention'.",
      inputSchema: z.object({
        max_score: z
          .number()
          .optional()
          .describe("Maximum health score threshold (default 40)"),
        min_lifetime_value: z
          .number()
          .optional()
          .describe("Minimum lifetime value to include (default 100)"),
        limit: z
          .number()
          .min(1)
          .max(25)
          .optional()
          .describe("Max results (default 10)"),
      }),
      execute: async ({ max_score = 40, min_lifetime_value = 100, limit = 10 }) => {
        // Fetch donors with meaningful giving
        const { data: donors, error } = await supabase
          .from("donors")
          .select("id,display_name,total_lifetime_value,last_donation_date")
          .eq("org_id", orgId)
          .gte("total_lifetime_value", min_lifetime_value)
          .order("total_lifetime_value", { ascending: false, nullsFirst: false })
          .limit(200)

        if (error) return { error: "Failed to load donors." }
        if (!donors?.length) return { at_risk_donors: [], total_found: 0 }

        const donorIds = donors.map((d) => d.id)

        // Batch fetch donations and interactions
        const [donationsRes, interactionsRes] = await Promise.all([
          supabase
            .from("donations")
            .select("donor_id,amount,date")
            .eq("org_id", orgId)
            .in("donor_id", donorIds)
            .order("date", { ascending: true }),
          supabase
            .from("interactions")
            .select("donor_id,date,type")
            .in("donor_id", donorIds)
            .order("date", { ascending: true }),
        ])

        // Group by donor
        const donationsByDonor = new Map<string, { amount: number | string | null; date: string | null }[]>()
        for (const d of donationsRes.data ?? []) {
          const list = donationsByDonor.get(d.donor_id) ?? []
          list.push({ amount: d.amount, date: d.date })
          donationsByDonor.set(d.donor_id, list)
        }

        const interactionsByDonor = new Map<string, { date: string | null; type: string }[]>()
        for (const i of interactionsRes.data ?? []) {
          if (!i.donor_id) continue
          const list = interactionsByDonor.get(i.donor_id) ?? []
          list.push({ date: i.date, type: i.type })
          interactionsByDonor.set(i.donor_id, list)
        }

        // Score and filter
        const atRisk = donors
          .map((donor) => {
            const donations = donationsByDonor.get(donor.id) ?? []
            if (donations.length < 2) return null // Need history to be "at risk"

            const score = computeDonorHealthScore({
              lastDonationDate: donor.last_donation_date ?? null,
              firstDonationDate: donations.length > 0 ? (donations[0].date as string | null) : null,
              totalLifetimeValue: Number(donor.total_lifetime_value ?? 0),
              donations,
              interactions: interactionsByDonor.get(donor.id) ?? [],
            })

            if (score.score > max_score) return null

            return {
              donor_id: donor.id,
              donor_name: donor.display_name,
              health_score: score.score,
              label: score.label,
              trend: score.trend,
              lifetime_value: Number(donor.total_lifetime_value ?? 0),
              last_donation_date: donor.last_donation_date,
              suggested_ask: score.suggestedAsk,
            }
          })
          .filter(Boolean)
          .sort((a, b) => a!.health_score - b!.health_score)

        return {
          at_risk_donors: atRisk.slice(0, limit),
          total_found: atRisk.length,
        }
      },
    }),

    create_custom_report: tool({
      description:
        "Build AND save a custom donor report to the Reports tab in one step. " +
        "Use this whenever the user asks to generate, build, create, or save a " +
        "report — do NOT wait for confirmation, the UI renders a Saved Report " +
        "card with an Open link. Use for any 'show me / list / find donors who…' " +
        "question whose criteria exceed search_donors — multi-temporal patterns " +
        "(retention/recapture/reactivation), multiple AND'd conditions on " +
        "different dimensions, etc. " +
        "If the user's request CANNOT be expressed in the supported filter " +
        "schema, pass filters: [] — the tool returns { error: 'unreliable_query' }.",
      inputSchema: z.object({
        title: z
          .string()
          .min(3)
          .max(120)
          .describe("Short title for the report (e.g. 'Recaptured donors 2026')"),
        summary: z
          .string()
          .max(300)
          .optional()
          .describe("One-sentence description of what this report finds"),
        filters: z
          .array(
            z.object({
              field: z.string(),
              operator: z.string(),
              value: z.union([z.string(), z.number(), z.array(z.string())]),
              value2: z.union([z.string(), z.number()]).optional(),
            })
          )
          .max(12)
          .describe(
            "Array of filter rows. Empty array signals you cannot reliably build the query."
          ),
        selectedColumns: z
          .array(z.string())
          .optional()
          .describe(
            "Column ids to include. Defaults to first_name, last_name, email, lifetime_value, last_gift_date."
          ),
        visibility: z
          .enum(["private", "shared"])
          .optional()
          .describe("Default: private. Use 'shared' if the user wants the team to see it."),
      }),
      execute: async ({ title, summary, filters, selectedColumns, visibility }) => {
        if (!filters || filters.length === 0) {
          console.log("[create_custom_report]", {
            branch: "unreliable_query",
            reason: "no_filters_provided",
            title,
          })
          return { error: "unreliable_query", reason: "no_filters_provided" }
        }

        const validated = filtersArraySchema.safeParse(filters)
        if (!validated.success) {
          console.log("[create_custom_report]", {
            branch: "unreliable_query",
            reason: "validation_failed",
            title,
          })
          return {
            error: "unreliable_query",
            reason: "validation_failed",
            details: validated.error.format(),
          }
        }

        const cols =
          selectedColumns && selectedColumns.length > 0
            ? selectedColumns.filter((c) => REPORT_COLUMN_CONFIG[c])
            : DEFAULT_AI_COLUMNS
        const finalCols = cols.length > 0 ? cols : DEFAULT_AI_COLUMNS

        const validatedFilters = validated.data as ValidatedFilterRow[]
        const filtersForQuery: FilterRow[] = validatedFilters.map((f) => ({
          id: f.id,
          field: f.field,
          operator: f.operator,
          value: f.value,
          value2: f.value2,
        }))

        let result
        try {
          result = await runFilterQuery({
            orgId,
            filters: filtersForQuery,
            selectedColumns: finalCols,
            allowEmpty: true,
          })
        } catch (e) {
          if (e instanceof EmptyResultError) {
            result = { rows: [], rowCount: 0, emptyByPrefilter: true }
          } else {
            const details = e instanceof Error ? e.message : String(e)
            console.log("[create_custom_report]", {
              branch: "unreliable_query",
              reason: "query_execution_failed",
              title,
              details,
            })
            return {
              error: "unreliable_query",
              reason: "query_execution_failed",
              details,
            }
          }
        }

        if (result.rowCount === 0) {
          console.log("[create_custom_report]", { branch: "ok_zero", title })
          return {
            ok: true,
            saved: false,
            report: {
              title,
              summary: summary ?? "",
              filters: validatedFilters,
              selectedColumns: finalCols,
              rowCount: 0,
            },
          }
        }

        const headerLabels = finalCols.map(
          (id) => REPORT_COLUMN_CONFIG[id]?.label ?? id
        )
        const outputRows = result.rows.map((r) => mapRowToOutputColumns(r, finalCols))
        const csv = [
          headerLabels.map(csvCell).join(","),
          ...outputRows.map((row) =>
            finalCols.map((id) => csvCell(row[id])).join(",")
          ),
        ].join("\n")

        const filterCriteria = {
          type: "CSV",
          content: csv,
          summary: summary ?? "",
          row_count: result.rowCount,
          bytes: Buffer.byteLength(csv, "utf8"),
          reportSource: "ai_chat" as const,
          filters: validatedFilters,
          selectedColumns: finalCols,
          visibility: visibility ?? "private",
        }

        const { data: inserted, error: insertError } = await supabase
          .from("saved_reports")
          .insert({
            organization_id: orgId,
            title,
            type: "CSV",
            content: csv,
            query: "",
            summary: summary ?? "",
            records_count: result.rowCount,
            visibility: visibility ?? "private",
            created_by_user_id: userId,
            filter_criteria: filterCriteria,
          })
          .select("id")
          .single()

        if (insertError || !inserted?.id) {
          console.error("[create_custom_report] insert failed", {
            orgId,
            title,
            error: insertError?.message,
            code: insertError?.code,
          })
          console.log("[create_custom_report]", {
            branch: "save_failed",
            title,
            reason: insertError?.message ?? "unknown_error",
          })
          return {
            error: "save_failed",
            reason: insertError?.message ?? "unknown_error",
          }
        }

        console.log("[create_custom_report]", {
          branch: "ok_saved",
          title,
          rowCount: result.rowCount,
          id: inserted.id,
        })
        return {
          ok: true,
          saved: true,
          report: {
            id: String(inserted.id),
            title,
            summary: summary ?? "",
            filters: validatedFilters,
            selectedColumns: finalCols,
            columnLabels: headerLabels,
            rowCount: result.rowCount,
            url: `/dashboard?view=saved-reports&reportId=${inserted.id}`,
          },
        }
      },
    }),
  }

  if (!redactor) return rawTools

  // Wrap each tool's execute to redact PII from results before the LLM sees them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped: Record<string, any> = {}
  for (const [name, t] of Object.entries(rawTools)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orig = t as any
    wrapped[name] = {
      ...orig,
      execute: async (...args: unknown[]) => {
        const result = await orig.execute(...args)
        return redactor.redactToolResult(result)
      },
    }
  }

  return wrapped as typeof rawTools
}
