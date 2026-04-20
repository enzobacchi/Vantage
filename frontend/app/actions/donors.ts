"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import { logAuditEvent } from "@/app/actions/audit"
import { isLimitExceeded } from "@/lib/subscription"

export type CreateDonorInput = {
  display_name: string
  email?: string | null
  phone?: string | null
  billing_address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  donor_type?: "individual" | "corporate" | "school" | "church"
}

/**
 * Create a new donor for the current organization.
 * Used when logging a donation for someone not yet in the CRM.
 */
export async function createDonor(input: CreateDonorInput): Promise<{ id: string }> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const displayName = input.display_name?.trim()
  if (!displayName) throw new Error("Display name is required")

  // Enforce donor limit based on subscription plan
  if (await isLimitExceeded(org.orgId, "donors")) {
    throw new Error("You've reached your donor limit. Please upgrade your plan to add more donors.")
  }

  const supabase = createAdminClient()
  const donorType = input.donor_type && ["individual", "corporate", "school", "church"].includes(input.donor_type)
    ? input.donor_type
    : "individual"
  const { data, error } = await supabase
    .from("donors")
    .insert({
      org_id: org.orgId,
      display_name: displayName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      billing_address: input.billing_address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zip: input.zip?.trim() || null,
      donor_type: donorType,
      total_lifetime_value: 0,
      last_donation_date: null,
      last_donation_amount: null,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error("Failed to create donor")

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/donations")
  revalidatePath("/dashboard?view=donor-crm")
  return { id: data.id }
}

/**
 * Update donor type. Scoped to current user's org.
 */
export async function updateDonorType(
  donorId: string,
  donorType: "individual" | "corporate" | "school" | "church"
): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("donors")
    .update({ donor_type: donorType })
    .eq("id", donorId)
    .eq("org_id", org.orgId)

  if (error) throw new Error(error.message)
  revalidatePath(`/donors/${donorId}`)
  revalidatePath("/dashboard?view=donor-crm")
}

export type UpdateDonorInput = {
  display_name?: string
  email?: string | null
  phone?: string | null
  billing_address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  mailing_address?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip?: string | null
  donor_type?: "individual" | "corporate" | "school" | "church"
  first_name?: string | null
  last_name?: string | null
  acquisition_source?: string | null
}

/**
 * Update a donor's profile fields. Scoped to current user's org.
 */
export async function updateDonor(donorId: string, input: UpdateDonorInput): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (input.display_name !== undefined) updates.display_name = input.display_name.trim() || null
  if (input.email !== undefined) updates.email = input.email?.trim() || null
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null
  if (input.billing_address !== undefined) updates.billing_address = input.billing_address?.trim() || null
  if (input.city !== undefined) updates.city = input.city?.trim() || null
  if (input.state !== undefined) updates.state = input.state?.trim() || null
  if (input.zip !== undefined) updates.zip = input.zip?.trim() || null
  if (input.mailing_address !== undefined) updates.mailing_address = input.mailing_address?.trim() || null
  if (input.mailing_city !== undefined) updates.mailing_city = input.mailing_city?.trim() || null
  if (input.mailing_state !== undefined) updates.mailing_state = input.mailing_state?.trim() || null
  if (input.mailing_zip !== undefined) updates.mailing_zip = input.mailing_zip?.trim() || null
  if (input.first_name !== undefined) updates.first_name = input.first_name?.trim() || null
  if (input.last_name !== undefined) updates.last_name = input.last_name?.trim() || null
  if (input.donor_type !== undefined) {
    if (["individual", "corporate", "school", "church"].includes(input.donor_type)) {
      updates.donor_type = input.donor_type
    }
  }
  if (input.acquisition_source !== undefined) {
    updates.acquisition_source = input.acquisition_source?.trim() || null
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await supabase
    .from("donors")
    .update(updates)
    .eq("id", donorId)
    .eq("org_id", org.orgId)

  if (error) throw new Error(error.message)
  revalidatePath(`/donors/${donorId}`)
  revalidatePath(`/dashboard/donors/${donorId}`)
  revalidatePath("/dashboard?view=donor-crm")
}

/**
 * Bulk delete donors and all their related data (donations, interactions, notes, tags, opportunities).
 * Only deletes donors belonging to the current org.
 */
export async function bulkDeleteDonors(donorIds: string[]): Promise<number> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")
  if (donorIds.length === 0) return 0

  const supabase = createAdminClient()

  // Verify donors belong to org
  const { data: orgDonors } = await supabase
    .from("donors")
    .select("id, display_name")
    .eq("org_id", org.orgId)
    .in("id", donorIds)

  const validDonors = orgDonors ?? []
  if (validDonors.length === 0) return 0
  const validIds = validDonors.map((d) => d.id)

  // Delete related data first (cascade handles most via FK, but be explicit)
  await supabase.from("donor_tags").delete().in("donor_id", validIds)
  await supabase.from("donor_notes").delete().in("donor_id", validIds)
  await supabase.from("interactions").delete().in("donor_id", validIds)
  await supabase.from("donations").delete().in("donor_id", validIds)
  await supabase.from("opportunities").delete().in("donor_id", validIds)

  const { error } = await supabase
    .from("donors")
    .delete()
    .in("id", validIds)
    .eq("org_id", org.orgId)

  if (error) throw new Error(error.message)

  await logAuditEvent({
    orgId: org.orgId,
    userId: org.userId,
    action: "bulk_delete",
    entityType: "donor",
    summary: `Deleted ${validDonors.length} donor${validDonors.length === 1 ? "" : "s"}`,
    details: {
      deletedDonors: validDonors.map((d) => ({
        id: d.id,
        name: d.display_name,
      })),
    },
  })

  revalidatePath("/dashboard")
  revalidatePath("/dashboard?view=donor-crm")
  return validDonors.length
}

/**
 * Merge two donors: keep the primary donor, absorb data from the secondary.
 * Moves all donations, interactions, notes, and tags from secondary to primary,
 * then deletes the secondary donor.
 */
export async function mergeDonors(
  keepDonorId: string,
  mergeDonorId: string
): Promise<{
  donations_moved: number
  interactions_moved: number
  notes_moved: number
  tags_moved: number
}> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  if (keepDonorId === mergeDonorId) {
    throw new Error("Cannot merge a donor with itself")
  }

  const supabase = createAdminClient()

  // Verify both donors belong to org
  const { data: donors } = await supabase
    .from("donors")
    .select("*")
    .eq("org_id", org.orgId)
    .in("id", [keepDonorId, mergeDonorId])

  if (!donors || donors.length !== 2) {
    throw new Error("Both donors must belong to your organization")
  }

  const mergeDonor = donors.find((d) => d.id === mergeDonorId)
  const keepDonor = donors.find((d) => d.id === keepDonorId)
  if (!mergeDonor || !keepDonor) throw new Error("Donor not found")

  // Move donations
  const { data: movedDonations } = await supabase
    .from("donations")
    .update({ donor_id: keepDonorId })
    .eq("donor_id", mergeDonorId)
    .select("id")
  const donationsMoved = movedDonations?.length ?? 0

  // Move interactions
  const { data: movedInteractions } = await supabase
    .from("interactions")
    .update({ donor_id: keepDonorId })
    .eq("donor_id", mergeDonorId)
    .select("id")
  const interactionsMoved = movedInteractions?.length ?? 0

  // Move notes
  const { data: movedNotes } = await supabase
    .from("donor_notes")
    .update({ donor_id: keepDonorId })
    .eq("donor_id", mergeDonorId)
    .select("id")
  const notesMoved = movedNotes?.length ?? 0

  // Move tags (skip duplicates by checking existing)
  const { data: existingTags } = await supabase
    .from("donor_tags")
    .select("tag_id")
    .eq("donor_id", keepDonorId)
  const existingTagIds = new Set((existingTags ?? []).map((t) => t.tag_id))

  const { data: mergeTags } = await supabase
    .from("donor_tags")
    .select("tag_id")
    .eq("donor_id", mergeDonorId)
  const newTags = (mergeTags ?? []).filter((t) => !existingTagIds.has(t.tag_id))

  if (newTags.length > 0) {
    await supabase.from("donor_tags").insert(
      newTags.map((t) => ({ donor_id: keepDonorId, tag_id: t.tag_id }))
    )
  }
  // Remove old tags
  await supabase.from("donor_tags").delete().eq("donor_id", mergeDonorId)
  const tagsMoved = newTags.length

  // Move opportunities
  await supabase
    .from("opportunities")
    .update({ donor_id: keepDonorId })
    .eq("donor_id", mergeDonorId)

  // Record merge history
  await supabase.from("donor_merge_history").insert({
    org_id: org.orgId,
    user_id: org.userId,
    kept_donor_id: keepDonorId,
    merged_donor_id: mergeDonorId,
    merged_donor_snapshot: mergeDonor as unknown as Record<string, unknown>,
    donations_moved: donationsMoved,
    interactions_moved: interactionsMoved,
    notes_moved: notesMoved,
    tags_moved: tagsMoved,
  })

  // Delete the merged donor
  await supabase.from("donors").delete().eq("id", mergeDonorId).eq("org_id", org.orgId)

  // Recalculate kept donor totals
  const { data: allDonations } = await supabase
    .from("donations")
    .select("amount,date")
    .eq("donor_id", keepDonorId)
    .order("date", { ascending: false })

  const rows = (allDonations ?? []) as { amount: number; date: string }[]
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const last = rows[0]

  await supabase
    .from("donors")
    .update({
      total_lifetime_value: total,
      last_donation_date: last?.date ?? null,
      last_donation_amount: last?.amount ?? null,
    })
    .eq("id", keepDonorId)

  await logAuditEvent({
    orgId: org.orgId,
    userId: org.userId,
    action: "merge",
    entityType: "donor",
    entityId: keepDonorId,
    summary: `Merged "${mergeDonor.display_name}" into "${keepDonor.display_name}"`,
    details: {
      keptDonorId: keepDonorId,
      mergedDonorId: mergeDonorId,
      mergedDonorName: mergeDonor.display_name,
      donationsMoved,
      interactionsMoved,
      notesMoved,
      tagsMoved,
    },
  })

  revalidatePath("/dashboard")
  revalidatePath("/dashboard?view=donor-crm")
  revalidatePath(`/donors/${keepDonorId}`)

  return { donations_moved: donationsMoved, interactions_moved: interactionsMoved, notes_moved: notesMoved, tags_moved: tagsMoved }
}
