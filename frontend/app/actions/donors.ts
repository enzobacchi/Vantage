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
