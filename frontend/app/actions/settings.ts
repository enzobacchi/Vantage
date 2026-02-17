"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type OrganizationProfile = {
  name: string | null
  website_url: string | null
  logo_url: string | null
}

export async function getOrganization(): Promise<OrganizationProfile | null> {
  const org = await getCurrentUserOrg()
  if (!org) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("organizations")
    .select("name,website_url,logo_url")
    .eq("id", org.orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return data as OrganizationProfile
}

export async function updateOrganization(form: {
  name: string
  website_url: string
  logo_url: string
}): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("organizations")
    .update({
      name: form.name.trim() || null,
      website_url: form.website_url.trim() || null,
      logo_url: form.logo_url.trim() || null,
    })
    .eq("id", org.orgId)

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
