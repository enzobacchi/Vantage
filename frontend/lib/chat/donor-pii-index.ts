import type { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/supabase/fetch-all"

export type PiiIndexAdmin = ReturnType<typeof createAdminClient>

export type DonorPiiRow = {
  display_name: string | null
  email: string | null
  phone: string | null
}

/**
 * Every donor's name, email and phone for one org — the list the PII
 * redactors are seeded from before any text reaches a model.
 *
 * Paged, because a single select stops at 1,000 rows and a donor missing
 * from this list is a donor whose name is sent to the model unredacted.
 * Ordered by id so placeholder numbering is stable across requests.
 * Throws on any failed page: callers must fail closed rather than redact
 * with a partial list.
 */
export async function loadDonorPiiIndex(admin: PiiIndexAdmin, orgId: string): Promise<DonorPiiRow[]> {
  return fetchAllRows<DonorPiiRow>((from, to) =>
    admin
      .from("donors")
      .select("display_name,email,phone")
      .eq("org_id", orgId)
      .order("id", { ascending: true })
      .range(from, to)
  )
}
