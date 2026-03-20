"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

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
