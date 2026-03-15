"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import type { PaymentMethod } from "@/types/database"

export type OrgDonationOptionRow = {
  id: string
  org_id: string
  type: "category" | "campaign" | "fund"
  name: string
  sort_order: number
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "check",
  "cash",
  "zelle",
  "wire",
  "venmo",
  "other",
  "quickbooks",
]

function isValidPaymentMethod(v: string): v is PaymentMethod {
  return PAYMENT_METHODS.includes(v as PaymentMethod)
}

/**
 * Get org-scoped donation options (categories, campaigns, funds).
 */
export async function getOrgDonationOptions(
  type?: "category" | "campaign" | "fund"
): Promise<OrgDonationOptionRow[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  let query = supabase
    .from("org_donation_options")
    .select("id,org_id,type,name,sort_order")
    .eq("org_id", org.orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  if (type) {
    query = query.eq("type", type)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as OrgDonationOptionRow[]
}

/**
 * Create a donation option (category, campaign, or fund).
 */
export async function createOrgDonationOption(
  type: "category" | "campaign" | "fund",
  name: string
): Promise<OrgDonationOptionRow> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const trimmed = name.trim()
  if (!trimmed) throw new Error("Name is required")

  const supabase = createAdminClient()

  const { data: maxOrder } = await supabase
    .from("org_donation_options")
    .select("sort_order")
    .eq("org_id", org.orgId)
    .eq("type", type)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = (maxOrder as { sort_order?: number } | null)?.sort_order ?? -1

  const { data, error } = await supabase
    .from("org_donation_options")
    .insert({
      org_id: org.orgId,
      type,
      name: trimmed,
      sort_order: sortOrder + 1,
    })
    .select("id,org_id,type,name,sort_order")
    .single()

  if (error) {
    if (error.code === "23505") throw new Error("An option with this name already exists.")
    throw new Error(error.message)
  }

  revalidatePath("/settings")
  revalidatePath("/dashboard/donations")
  revalidatePath("/dashboard/donations/entry")
  return data as OrgDonationOptionRow
}

/**
 * Update a donation option.
 */
export async function updateOrgDonationOption(
  id: string,
  updates: { name?: string; sort_order?: number }
): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) payload.name = updates.name.trim()
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order

  const { error } = await supabase
    .from("org_donation_options")
    .update(payload)
    .eq("id", id)
    .eq("org_id", org.orgId)

  if (error) throw new Error(error.message)

  revalidatePath("/settings")
  revalidatePath("/dashboard/donations")
  revalidatePath("/dashboard/donations/entry")
}

/**
 * Delete a donation option.
 */
export async function deleteOrgDonationOption(id: string): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("org_donation_options")
    .delete()
    .eq("id", id)
    .eq("org_id", org.orgId)

  if (error) throw new Error(error.message)

  revalidatePath("/settings")
  revalidatePath("/dashboard/donations")
  revalidatePath("/dashboard/donations/entry")
}

export type CreateDonationInput = {
  donor_id: string
  amount: number
  date: string
  payment_method: PaymentMethod
  category_id?: string | null
  campaign_id?: string | null
  fund_id?: string | null
  memo?: string | null
}

/**
 * Create a manual donation and update donor totals.
 */
export async function createDonation(input: CreateDonationInput): Promise<string> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number")
  }

  const dateStr = typeof input.date === "string" ? input.date.trim() : ""
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error("Date must be in YYYY-MM-DD format")
  }

  if (!isValidPaymentMethod(input.payment_method)) {
    throw new Error("Invalid payment method")
  }

  const supabase = createAdminClient()

  const { data: donor } = await supabase
    .from("donors")
    .select("id")
    .eq("id", input.donor_id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (!donor) throw new Error("Donor not found")

  const { data: donation, error } = await supabase
    .from("donations")
    .insert({
      donor_id: input.donor_id,
      amount,
      date: dateStr,
      memo: input.memo?.trim() || null,
      payment_method: input.payment_method,
      category_id: input.category_id || null,
      campaign_id: input.campaign_id || null,
      fund_id: input.fund_id || null,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  if (!donation?.id) throw new Error("Failed to create donation")

  await recalcDonorTotals(supabase, input.donor_id)

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/donations")
  revalidatePath(`/donors/${input.donor_id}`)
  return donation.id
}

async function recalcDonorTotals(
  supabase: ReturnType<typeof createAdminClient>,
  donorId: string
): Promise<void> {
  const { data: donations } = await supabase
    .from("donations")
    .select("amount,date")
    .eq("donor_id", donorId)
    .order("date", { ascending: false })

  const rows = (donations ?? []) as { amount: number; date: string }[]
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const last = rows[0]

  await supabase
    .from("donors")
    .update({
      total_lifetime_value: total,
      last_donation_date: last?.date ?? null,
      last_donation_amount: last?.amount ?? null,
    })
    .eq("id", donorId)
}

export type BulkUpdateDonationsInput = {
  donationIds: string[]
  payment_method?: PaymentMethod
  category_id?: string | null
  campaign_id?: string | null
  fund_id?: string | null
}

/**
 * Bulk update donations. Only donations belonging to org (via donor) are updated.
 */
export async function bulkUpdateDonations(input: BulkUpdateDonationsInput): Promise<number> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  if (input.donationIds.length === 0) return 0

  const updates: Record<string, unknown> = {}
  if (input.payment_method !== undefined) {
    if (!isValidPaymentMethod(input.payment_method)) throw new Error("Invalid payment method")
    updates.payment_method = input.payment_method
  }
  if (input.category_id !== undefined) updates.category_id = input.category_id
  if (input.campaign_id !== undefined) updates.campaign_id = input.campaign_id
  if (input.fund_id !== undefined) updates.fund_id = input.fund_id

  if (Object.keys(updates).length === 0) return 0

  const supabase = createAdminClient()

  const { data: orgDonors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", org.orgId)
  const orgDonorIds = new Set((orgDonors ?? []).map((d: { id: string }) => d.id))

  const { data: donations } = await supabase
    .from("donations")
    .select("id,donor_id")
    .in("id", input.donationIds)

  const validIds = (donations ?? [])
    .filter((d: { donor_id: string }) => orgDonorIds.has(d.donor_id))
    .map((d: { id: string }) => d.id)

  if (validIds.length === 0) return 0

  const { error } = await supabase
    .from("donations")
    .update(updates)
    .in("id", validIds)

  if (error) throw new Error(error.message)

  const donorIds = [...new Set((donations ?? []).map((d: { donor_id: string }) => d.donor_id))]
  for (const donorId of donorIds) {
    if (orgDonorIds.has(donorId)) {
      await recalcDonorTotals(supabase, donorId)
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/donations")
  return validIds.length
}
