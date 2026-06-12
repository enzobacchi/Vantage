"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import { notifyNewDonation, checkAndNotifyMilestones } from "@/lib/notifications"
import { tryPushDonationInline } from "@/lib/quickbooks/writeback"
import { recalcDonorTotals } from "@/lib/recalc-donor-totals"
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
  "daf",
]

/**
 * Given category/campaign/fund ids from a request, return a map keeping only
 * those that actually belong to the org (others → null). Prevents attaching a
 * foreign org's donation-option id to a donation (which would otherwise leak
 * the option name back on read).
 */
async function sanitizeOptionIds(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  ids: { category_id?: string | null; campaign_id?: string | null; fund_id?: string | null }
): Promise<{ category_id: string | null; campaign_id: string | null; fund_id: string | null }> {
  const wanted = [ids.category_id, ids.campaign_id, ids.fund_id].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  )
  if (wanted.length === 0) {
    return { category_id: null, campaign_id: null, fund_id: null }
  }
  const { data } = await supabase
    .from("org_donation_options")
    .select("id")
    .eq("org_id", orgId)
    .in("id", wanted)
  const valid = new Set((data ?? []).map((o: { id: string }) => o.id))
  const keep = (v?: string | null) => (v && valid.has(v) ? v : null)
  return {
    category_id: keep(ids.category_id),
    campaign_id: keep(ids.campaign_id),
    fund_id: keep(ids.fund_id),
  }
}

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
    .select("id, display_name, total_lifetime_value")
    .eq("id", input.donor_id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (!donor) throw new Error("Donor not found")

  const previousTotal = Number(donor.total_lifetime_value ?? 0)
  const donorName = (donor.display_name as string) || "Unknown Donor"

  // QB write-back: when the org opted in, new donations start `pending` and
  // get a best-effort inline push below (cron sweeps any failures).
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("qb_writeback_enabled, qb_realm_id, qb_refresh_token")
    .eq("id", org.orgId)
    .maybeSingle()
  const writebackEnabled = !!(
    orgRow?.qb_writeback_enabled &&
    orgRow.qb_realm_id &&
    orgRow.qb_refresh_token
  )

  const options = await sanitizeOptionIds(supabase, org.orgId, input)

  const { data: donation, error } = await supabase
    .from("donations")
    .insert({
      org_id: org.orgId,
      donor_id: input.donor_id,
      amount,
      date: dateStr,
      memo: input.memo?.trim() || null,
      payment_method: input.payment_method,
      category_id: options.category_id,
      campaign_id: options.campaign_id,
      fund_id: options.fund_id,
      source: "manual",
      ...(writebackEnabled ? { qb_sync_status: "pending" } : {}),
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  if (!donation?.id) throw new Error("Failed to create donation")

  if (writebackEnabled) {
    // Inline best-effort — a QB failure never fails donation creation
    await tryPushDonationInline(supabase, org.orgId, donation.id)
  }

  await recalcDonorTotals(supabase, input.donor_id)

  // Fire-and-forget notification emails
  const newTotal = previousTotal + amount
  void notifyNewDonation(org.orgId, donorName, amount, input.donor_id).catch(console.error)
  void checkAndNotifyMilestones(org.orgId, input.donor_id, donorName, previousTotal, newTotal).catch(console.error)

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/donations")
  revalidatePath(`/donors/${input.donor_id}`)
  return donation.id
}

// Shared utility — see frontend/lib/recalc-donor-totals.ts

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

  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (input.payment_method !== undefined) {
    if (!isValidPaymentMethod(input.payment_method)) throw new Error("Invalid payment method")
    updates.payment_method = input.payment_method
  }
  // Only accept option ids that belong to this org (foreign ids → null).
  if (
    input.category_id !== undefined ||
    input.campaign_id !== undefined ||
    input.fund_id !== undefined
  ) {
    const options = await sanitizeOptionIds(supabase, org.orgId, input)
    if (input.category_id !== undefined) updates.category_id = options.category_id
    if (input.campaign_id !== undefined) updates.campaign_id = options.campaign_id
    if (input.fund_id !== undefined) updates.fund_id = options.fund_id
  }

  if (Object.keys(updates).length === 0) return 0

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

/**
 * Mark donations as acknowledged (thank-you sent).
 */
export async function markDonationsAcknowledged(input: {
  donationIds: string[]
  sentBy?: string | null
}): Promise<number> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  if (input.donationIds.length === 0) return 0

  const supabase = createAdminClient()

  // Verify donations belong to org via donor
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
    .update({
      acknowledgment_sent_at: new Date().toISOString(),
      acknowledgment_sent_by: input.sentBy?.trim() || null,
    })
    .in("id", validIds)

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard/donations")
  return validIds.length
}

export type BulkCreateDonationRow = {
  donor_id: string
  amount: number
  date: string
  payment_method: PaymentMethod
  category_id?: string | null
  campaign_id?: string | null
  fund_id?: string | null
  memo?: string | null
}

export type BulkCreateDonationsResult = {
  created: number
  errors: Array<{ index: number; message: string }>
}

/**
 * Insert many donations in one call. Used by the voice-dictation flow and any
 * future batch entry surface. Validates each row, verifies donor ownership in
 * a single query, inserts in chunks, and recalculates donor totals once per
 * affected donor (not per donation).
 *
 * Notification fanout is deduped per donor: a single new-donation email per
 * unique donor regardless of how many donations were committed in this batch.
 */
export async function bulkCreateDonations(
  rows: BulkCreateDonationRow[],
  source: string = "manual"
): Promise<BulkCreateDonationsResult> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const result: BulkCreateDonationsResult = { created: 0, errors: [] }
  if (rows.length === 0) return result

  const supabase = createAdminClient()

  // Verify all referenced donors belong to this org in one query.
  const donorIds = [...new Set(rows.map((r) => r.donor_id))]
  const { data: orgDonors, error: donorErr } = await supabase
    .from("donors")
    .select("id, display_name, total_lifetime_value")
    .eq("org_id", org.orgId)
    .in("id", donorIds)
  if (donorErr) throw new Error(donorErr.message)

  const donorMap = new Map<string, { display_name: string | null; total_lifetime_value: number | string | null }>()
  for (const d of orgDonors ?? []) {
    donorMap.set(d.id as string, {
      display_name: d.display_name as string | null,
      total_lifetime_value: d.total_lifetime_value as number | string | null,
    })
  }

  // Pre-fetch this org's donation-option ids so foreign category/campaign/fund
  // ids on any row are dropped to null (can't attach another org's option).
  const requestedOptionIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.category_id, r.campaign_id, r.fund_id])
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    ),
  ]
  let validOptionIds = new Set<string>()
  if (requestedOptionIds.length > 0) {
    const { data: opts } = await supabase
      .from("org_donation_options")
      .select("id")
      .eq("org_id", org.orgId)
      .in("id", requestedOptionIds)
    validOptionIds = new Set((opts ?? []).map((o: { id: string }) => o.id))
  }
  const keepOption = (v?: string | null) => (v && validOptionIds.has(v) ? v : null)

  // Per-row validation. Build the validated payload and remember the original
  // index so we can report errors with stable row numbers.
  const validRows: Array<{ index: number; payload: Record<string, unknown> }> = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const amount = Number(r.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      result.errors.push({ index: i, message: "Amount must be a positive number" })
      continue
    }
    const dateStr = typeof r.date === "string" ? r.date.trim() : ""
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      result.errors.push({ index: i, message: "Date must be YYYY-MM-DD" })
      continue
    }
    if (!isValidPaymentMethod(r.payment_method)) {
      result.errors.push({ index: i, message: "Invalid payment method" })
      continue
    }
    if (!donorMap.has(r.donor_id)) {
      result.errors.push({ index: i, message: "Donor not found in this organization" })
      continue
    }
    validRows.push({
      index: i,
      payload: {
        org_id: org.orgId,
        donor_id: r.donor_id,
        amount,
        date: dateStr,
        memo: r.memo?.trim() || null,
        payment_method: r.payment_method,
        category_id: keepOption(r.category_id),
        campaign_id: keepOption(r.campaign_id),
        fund_id: keepOption(r.fund_id),
        source,
      },
    })
  }

  if (validRows.length === 0) return result

  // Insert in chunks. Per-chunk failure isolates that chunk's rows as errors;
  // remaining chunks still proceed. Mirrors phase 5 of importDonorsFromCSV.
  const INSERT_CHUNK = 500
  for (let i = 0; i < validRows.length; i += INSERT_CHUNK) {
    const chunk = validRows.slice(i, i + INSERT_CHUNK)
    const { error } = await supabase
      .from("donations")
      .insert(chunk.map((c) => c.payload))
    if (error) {
      for (const c of chunk) {
        result.errors.push({ index: c.index, message: error.message })
      }
      continue
    }
    result.created += chunk.length
  }

  // Recalc totals once per affected donor.
  const affectedDonorIds = [
    ...new Set(validRows.map((v) => v.payload.donor_id as string)),
  ]
  for (const donorId of affectedDonorIds) {
    await recalcDonorTotals(supabase, donorId)
  }

  // Fire-and-forget notifications, deduped per donor. We sum the donor's batch
  // amount for the milestone check so a single batch crossing a threshold is
  // detected (rather than per-row noise).
  const totalsByDonor = new Map<string, number>()
  for (const v of validRows) {
    const id = v.payload.donor_id as string
    totalsByDonor.set(id, (totalsByDonor.get(id) ?? 0) + (v.payload.amount as number))
  }
  for (const [donorId, batchAmount] of totalsByDonor) {
    const donor = donorMap.get(donorId)
    const donorName = donor?.display_name?.trim() || "Unknown Donor"
    const previousTotal = Number(donor?.total_lifetime_value ?? 0)
    const newTotal = previousTotal + batchAmount
    void notifyNewDonation(org.orgId, donorName, batchAmount, donorId).catch(console.error)
    void checkAndNotifyMilestones(org.orgId, donorId, donorName, previousTotal, newTotal).catch(
      console.error
    )
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/donations")
  return result
}

/**
 * Clear acknowledgment status from donations.
 */
export async function clearDonationAcknowledgment(donationIds: string[]): Promise<number> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  if (donationIds.length === 0) return 0

  const supabase = createAdminClient()

  const { data: orgDonors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", org.orgId)
  const orgDonorIds = new Set((orgDonors ?? []).map((d: { id: string }) => d.id))

  const { data: donations } = await supabase
    .from("donations")
    .select("id,donor_id")
    .in("id", donationIds)

  const validIds = (donations ?? [])
    .filter((d: { donor_id: string }) => orgDonorIds.has(d.donor_id))
    .map((d: { id: string }) => d.id)

  if (validIds.length === 0) return 0

  const { error } = await supabase
    .from("donations")
    .update({
      acknowledgment_sent_at: null,
      acknowledgment_sent_by: null,
    })
    .in("id", validIds)

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard/donations")
  return validIds.length
}

/**
 * Re-attempt a failed QuickBooks push for one donation. Resets the attempt
 * counter so the push isn't blocked by the max-attempts cap.
 */
export async function retryQBPush(
  donationId: string
): Promise<{ ok: boolean; error?: string }> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  const { data: donation } = await supabase
    .from("donations")
    .select("id")
    .eq("id", donationId)
    .eq("org_id", org.orgId)
    .maybeSingle()
  if (!donation) throw new Error("Donation not found")

  await supabase
    .from("donations")
    .update({ qb_sync_status: "pending", qb_sync_attempts: 0, qb_sync_error: null })
    .eq("id", donationId)
    .eq("org_id", org.orgId)

  await tryPushDonationInline(supabase, org.orgId, donationId)

  const { data: after } = await supabase
    .from("donations")
    .select("qb_sync_status, qb_sync_error")
    .eq("id", donationId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  revalidatePath("/dashboard/donations")
  if (after?.qb_sync_status === "synced") return { ok: true }
  return { ok: false, error: (after?.qb_sync_error as string | null) ?? "Push did not complete" }
}
