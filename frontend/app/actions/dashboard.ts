"use server"

import { getCurrentUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export type TopDonorRow = {
  id: string
  display_name: string | null
  amount: number
  last_donation_date: string | null
}

const LIMIT = 5

function toNumber(value: unknown): number {
  if (value == null) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Normalize to YYYY-MM-DD for comparison with donations.date (transaction date). */
function toDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Get top donors by giving in the selected time range.
 * "all" = order by total_lifetime_value (all-time).
 * "30d" | "90d" | "ytd" = sum donations in that window (donations.date = transaction date), order by that sum.
 */
export async function getTopDonors(
  range: "30d" | "90d" | "ytd" | "all"
): Promise<TopDonorRow[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()

  if (range === "all") {
    const { data, error } = await supabase
      .from("donors")
      .select("id, display_name, total_lifetime_value, last_donation_date")
      .eq("org_id", org.orgId)
      .order("total_lifetime_value", { ascending: false, nullsFirst: false })
      .limit(LIMIT)

    if (error) return []
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      display_name: row.display_name != null ? String(row.display_name) : null,
      amount: toNumber(row.total_lifetime_value),
      last_donation_date:
        row.last_donation_date != null ? String(row.last_donation_date) : null,
    }))
  }

  const now = new Date()
  let cutoff: string
  if (range === "30d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 30)
    cutoff = toDateOnly(d)
  } else if (range === "90d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 90)
    cutoff = toDateOnly(d)
  } else {
    cutoff = `${now.getFullYear()}-01-01`
  }

  // Single query using org_id directly — no batch loop needed
  const { data: donationRows, error: donationError } = await supabase
    .from("donations")
    .select("donor_id, amount, date")
    .eq("org_id", org.orgId)
    .gte("date", cutoff)

  if (donationError) return []

  const sumByDonor = new Map<
    string,
    { total: number; lastDate: string | null }
  >()

  for (const row of (donationRows ?? []) as Record<string, unknown>[]) {
    const donorId = String(row.donor_id)
    const amount = toNumber(row.amount)
    const dateRaw = row.date
    const date = dateRaw != null ? String(dateRaw).slice(0, 10) : null
    const cur = sumByDonor.get(donorId) ?? { total: 0, lastDate: null }
    cur.total += amount
    if (date && (!cur.lastDate || date > cur.lastDate)) cur.lastDate = date
    sumByDonor.set(donorId, cur)
  }

  const sorted = [...sumByDonor.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, LIMIT)

  const donorIdsToFetch = sorted.map(([id]) => id)
  if (donorIdsToFetch.length === 0) return []

  const { data: donors } = await supabase
    .from("donors")
    .select("id, display_name, last_donation_date")
    .in("id", donorIdsToFetch)

  const donorMap = new Map(
    (donors ?? []).map((d: Record<string, unknown>) => [
      String(d.id),
      {
        display_name: d.display_name != null ? String(d.display_name) : null,
        last_donation_date:
          d.last_donation_date != null ? String(d.last_donation_date) : null,
      },
    ])
  )

  return sorted.map(([id, { total, lastDate }]) => {
    const info = donorMap.get(id)
    return {
      id,
      display_name: info?.display_name ?? null,
      amount: total,
      last_donation_date: lastDate ?? info?.last_donation_date ?? null,
    }
  })
}
