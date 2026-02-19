"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type DonorProfileDonor = {
  id: string
  org_id: string
  display_name: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  total_lifetime_value: number | string | null
  last_donation_date: string | null
  notes: string | null
}

export type DonorProfileDonation = {
  id: string
  donor_id: string
  amount: number | string | null
  date: string | null
  memo: string | null
}

export type DonorProfileResult = {
  donor: DonorProfileDonor | null
  donations: DonorProfileDonation[]
}

/**
 * Fetch a single donor by ID and all related donations (ordered by date desc).
 * Scoped to current user's org; returns null donor if not found or wrong org (page will 404).
 */
export async function getDonorProfile(id: string): Promise<DonorProfileResult> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select(
      "id,org_id,display_name,email,phone,billing_address,city,state,zip,total_lifetime_value,last_donation_date,notes"
    )
    .eq("id", id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError) {
    throw new Error(donorError.message)
  }

  if (!donor) {
    return { donor: null, donations: [] }
  }

  const { data: donations, error: donationsError } = await supabase
    .from("donations")
    .select("id,donor_id,amount,date,memo")
    .eq("donor_id", id)
    .order("date", { ascending: false })

  if (donationsError) {
    throw new Error(donationsError.message)
  }

  return {
    donor: donor as DonorProfileDonor,
    donations: (donations ?? []) as DonorProfileDonation[],
  }
}

/**
 * Update donor notes. Returns updated notes or throws. Scoped to current user's org.
 */
export async function updateDonorNotes(donorId: string, notes: string | null): Promise<string | null> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("donors")
    .update({ notes: notes ?? null })
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .select("notes")
    .single()

  if (error || !data) {
    throw new Error("Donor not found.")
  }

  return (data.notes as string | null) ?? null
}

/**
 * Log a call note for a donor. Inserts into donor_notes and revalidates the profile. Scoped to current user's org.
 */
export async function logCall(donorId: string, note: string): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const trimmed = note?.trim() ?? ""
  if (!trimmed) {
    throw new Error("Note cannot be empty.")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    throw new Error("Donor not found.")
  }

  const { error } = await supabase.from("donor_notes").insert({
    donor_id: donorId,
    note: trimmed,
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/donors/${donorId}`)
}

export type DonorNoteRow = {
  id: string
  donor_id: string
  note: string
  created_at: string
}

/**
 * Fetch activity log notes for a donor (newest first). Scoped to current user's org.
 */
export async function getDonorActivityNotes(donorId: string): Promise<DonorNoteRow[]> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    return []
  }

  const { data, error } = await supabase
    .from("donor_notes")
    .select("id,donor_id,note,created_at")
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as DonorNoteRow[]
}
