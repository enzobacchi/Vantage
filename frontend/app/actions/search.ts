"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type SearchDonorResult = {
  id: string
  display_name: string | null
  total_lifetime_value: number | string | null
}

/**
 * Returns donors in the current user's org whose display_name or email contains the query (case-insensitive).
 * Uses the same .ilike() pattern as elsewhere in the app for reliability.
 * Never throws: returns [] on any error so the pipeline UI doesn't get a 500.
 */
export async function searchDonors(query: string): Promise<SearchDonorResult[]> {
  try {
    const org = await getCurrentUserOrg()
    if (!org) {
      return []
    }

    const trimmed = (query ?? "").trim()
    if (!trimmed) {
      return []
    }

    const supabase = createAdminClient()
    const pattern = `%${trimmed}%`

    // Use .ilike() on one column at a time (same pattern as retrieval.ts) so search always works
    const [nameRes, emailRes] = await Promise.all([
      supabase
        .from("donors")
        .select("id,display_name,total_lifetime_value")
        .eq("org_id", org.orgId)
        .ilike("display_name", pattern)
        .order("total_lifetime_value", { ascending: false, nullsFirst: false })
        .limit(10),
      trimmed.includes("@")
        ? Promise.resolve({ data: [] as SearchDonorResult[], error: null })
        : supabase
            .from("donors")
            .select("id,display_name,total_lifetime_value")
            .eq("org_id", org.orgId)
            .ilike("email", pattern)
            .order("total_lifetime_value", { ascending: false, nullsFirst: false })
            .limit(10),
    ])

    if (nameRes.error) return []
    const byName = (nameRes.data ?? []) as SearchDonorResult[]
    const byEmail = (emailRes.error ? [] : (emailRes.data ?? [])) as SearchDonorResult[]

    const seen = new Set<string>()
    const merged: SearchDonorResult[] = []
    for (const r of [...byName, ...byEmail]) {
      if (!seen.has(r.id)) {
        seen.add(r.id)
        merged.push(r)
      }
    }
    return merged.slice(0, 10)
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[searchDonors]", err)
    }
    return []
  }
}
