"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  Pledge,
  PledgeFrequency,
  PledgeStatus,
  CreatePledgeInput,
  UpdatePledgeInput,
} from "@/lib/pledge-constants"

// Re-export types (type-only re-exports are safe in "use server" files)
export type { Pledge, PledgeFrequency, PledgeStatus, CreatePledgeInput, UpdatePledgeInput }

// ─── Read ──────────────────────────────────────────────────────────

/** Get all pledges for the org, with donor info and payment progress. */
export async function getPledges(): Promise<Pledge[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("pledges")
    .select("*,donors(display_name)")
    .eq("org_id", org.orgId)
    .order("created_at", { ascending: false })

  if (error) return []

  const pledgeIds = (data ?? []).map((p: any) => p.id)

  // Fetch linked donation totals
  let paymentTotals: Record<string, { total: number; count: number }> = {}
  if (pledgeIds.length > 0) {
    const { data: donations } = await supabase
      .from("donations")
      .select("pledge_id,amount")
      .in("pledge_id", pledgeIds)

    for (const d of donations ?? []) {
      if (!d.pledge_id) continue
      const entry = paymentTotals[d.pledge_id] ?? { total: 0, count: 0 }
      entry.total += Number(d.amount ?? 0)
      entry.count += 1
      paymentTotals[d.pledge_id] = entry
    }
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    org_id: row.org_id,
    donor_id: row.donor_id,
    amount: Number(row.amount),
    frequency: row.frequency as PledgeFrequency,
    start_date: row.start_date,
    end_date: row.end_date ?? null,
    status: row.status as PledgeStatus,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    donor: row.donors ?? null,
    amount_received: paymentTotals[row.id]?.total ?? 0,
    payments_count: paymentTotals[row.id]?.count ?? 0,
  }))
}

/** Get pledges for a specific donor. */
export async function getDonorPledges(donorId: string): Promise<Pledge[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("pledges")
    .select("*")
    .eq("org_id", org.orgId)
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false })

  if (error) return []

  const pledgeIds = (data ?? []).map((p: any) => p.id)

  let paymentTotals: Record<string, { total: number; count: number }> = {}
  if (pledgeIds.length > 0) {
    const { data: donations } = await supabase
      .from("donations")
      .select("pledge_id,amount")
      .in("pledge_id", pledgeIds)

    for (const d of donations ?? []) {
      if (!d.pledge_id) continue
      const entry = paymentTotals[d.pledge_id] ?? { total: 0, count: 0 }
      entry.total += Number(d.amount ?? 0)
      entry.count += 1
      paymentTotals[d.pledge_id] = entry
    }
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    org_id: row.org_id,
    donor_id: row.donor_id,
    amount: Number(row.amount),
    frequency: row.frequency as PledgeFrequency,
    start_date: row.start_date,
    end_date: row.end_date ?? null,
    status: row.status as PledgeStatus,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    amount_received: paymentTotals[row.id]?.total ?? 0,
    payments_count: paymentTotals[row.id]?.count ?? 0,
  }))
}

// ─── Create ────────────────────────────────────────────────────────

export async function createPledge(
  input: CreatePledgeInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const org = await getCurrentUserOrg()
    if (!org) return { ok: false, error: "Unauthorized" }

    if (!input.amount || input.amount <= 0) {
      return { ok: false, error: "Amount must be greater than zero" }
    }
    if (!input.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) {
      return { ok: false, error: "Start date is required (YYYY-MM-DD)" }
    }

    const supabase = createAdminClient()

    // Verify donor belongs to org
    const { data: donor } = await supabase
      .from("donors")
      .select("id")
      .eq("id", input.donor_id)
      .eq("org_id", org.orgId)
      .single()

    if (!donor) return { ok: false, error: "Donor not found" }

    const { data, error } = await supabase
      .from("pledges")
      .insert({
        org_id: org.orgId,
        donor_id: input.donor_id,
        amount: input.amount,
        frequency: input.frequency ?? "one_time",
        start_date: input.start_date,
        end_date: input.end_date ?? null,
        notes: input.notes?.trim() || null,
      })
      .select("id")
      .single()

    if (error) return { ok: false, error: error.message }

    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/donors/${input.donor_id}`)
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create pledge" }
  }
}

// ─── Update ────────────────────────────────────────────────────────

export async function updatePledge(
  id: string,
  updates: UpdatePledgeInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { ok: false, error: "Unauthorized" }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("pledges")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", org.orgId)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/dashboard")
  return { ok: true }
}

// ─── Delete ────────────────────────────────────────────────────────

export async function deletePledge(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { ok: false, error: "Unauthorized" }

  const supabase = createAdminClient()

  // Unlink any donations from this pledge first
  await supabase
    .from("donations")
    .update({ pledge_id: null })
    .eq("pledge_id", id)

  const { error } = await supabase
    .from("pledges")
    .delete()
    .eq("id", id)
    .eq("org_id", org.orgId)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/dashboard")
  return { ok: true }
}
