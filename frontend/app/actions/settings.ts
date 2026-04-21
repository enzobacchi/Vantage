"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg, getCurrentUserOrgWithRole } from "@/lib/auth"

export type OrganizationProfile = {
  name: string | null
  website_url: string | null
  logo_url: string | null
  tax_id: string | null
  legal_501c3_wording: string | null
  fiscal_year_start_month: number
}

export async function getOrganization(): Promise<OrganizationProfile | null> {
  const org = await getCurrentUserOrg()
  if (!org) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("organizations")
    .select("name,website_url,logo_url,tax_id,legal_501c3_wording,fiscal_year_start_month")
    .eq("id", org.orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as OrganizationProfile & { fiscal_year_start_month: number | null }
  return { ...row, fiscal_year_start_month: row.fiscal_year_start_month ?? 1 }
}

export async function getOrganizationRole(): Promise<string | null> {
  const org = await getCurrentUserOrgWithRole()
  return org?.role ?? null
}

export async function updateOrganization(form: {
  name: string
  website_url: string
  logo_url: string
  tax_id: string
  legal_501c3_wording: string
  fiscal_year_start_month?: number
}): Promise<void> {
  const org = await getCurrentUserOrgWithRole()
  if (!org) throw new Error("Unauthorized")
  if (org.role !== "owner") throw new Error("Only the organization owner can update these settings.")

  const update: Record<string, string | number | null> = {
    name: form.name.trim() || null,
    website_url: form.website_url.trim() || null,
    logo_url: form.logo_url.trim() || null,
    tax_id: form.tax_id.trim() || null,
    legal_501c3_wording: form.legal_501c3_wording.trim() || null,
  }
  if (form.fiscal_year_start_month !== undefined) {
    const m = form.fiscal_year_start_month
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new Error("Fiscal year start month must be 1–12.")
    }
    update.fiscal_year_start_month = m
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", org.orgId)

  if (error) throw new Error(error.message)
}

/**
 * Permanently deletes the current organization and ALL associated data.
 * Restricted to org owners only. Deletion order respects foreign key dependencies.
 */
export async function deleteOrganization(): Promise<void> {
  const org = await getCurrentUserOrgWithRole()
  if (!org) throw new Error("Unauthorized")
  if (org.role !== "owner") throw new Error("Only the organization owner can delete the organization.")

  const supabase = createAdminClient()

  // Get all donor IDs for this org first (needed to delete child records)
  const { data: donors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", org.orgId)

  const donorIds = (donors ?? []).map((d: { id: string }) => d.id)

  // Delete donor-keyed child records
  if (donorIds.length > 0) {
    await supabase.from("interactions").delete().in("donor_id", donorIds)
    await supabase.from("donor_tags").delete().in("donor_id", donorIds)
    await supabase.from("donor_notes").delete().in("donor_id", donorIds)
    await supabase.from("donations").delete().in("donor_id", donorIds)
  }

  // Delete donors
  await supabase.from("donors").delete().eq("org_id", org.orgId)

  // Delete org-level records
  await supabase.from("opportunities").delete().eq("organization_id", org.orgId)
  await supabase.from("saved_reports").delete().eq("organization_id", org.orgId)
  await supabase.from("saved_lists").delete().eq("organization_id", org.orgId)
  await supabase.from("report_folders").delete().eq("organization_id", org.orgId)
  await supabase.from("tags").delete().eq("organization_id", org.orgId)
  await supabase.from("tasks").delete().eq("organization_id", org.orgId)
  await supabase.from("email_send_log").delete().eq("org_id", org.orgId)
  await supabase.from("invitations").delete().eq("organization_id", org.orgId)
  await supabase.from("organization_members").delete().eq("organization_id", org.orgId)

  // Finally delete the organization itself
  const { error } = await supabase.from("organizations").delete().eq("id", org.orgId)
  if (error) throw new Error(error.message)
}

export async function updateProfile(form: {
  first_name: string
  last_name: string
  avatar_url: string
}): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ").trim()
  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(org.userId, {
    user_metadata: {
      full_name: fullName || undefined,
      first_name: form.first_name.trim() || undefined,
      last_name: form.last_name.trim() || undefined,
      avatar_url: form.avatar_url.trim() || undefined,
    },
  })

  if (error) throw new Error(error.message)
}
