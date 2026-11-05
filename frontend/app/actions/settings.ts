"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg, getCurrentUserOrgWithRole } from "@/lib/auth"
import { deleteOrganizationData, removeOrphanedLogins } from "@/lib/org-teardown"

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
 * Permanently deletes the current organization and ALL associated data, owner
 * only. Cancels any live Stripe subscription first (nothing is deleted if that
 * fails), then removes the logins of members left without an organization.
 * See lib/org-teardown.ts. Returns `{ error }` rather than throwing: Next.js
 * hides thrown server-action messages in production.
 */
export async function deleteOrganization(): Promise<{ error?: string; warning?: string }> {
  const org = await getCurrentUserOrgWithRole()
  if (!org) return { error: "Unauthorized" }
  if (org.role !== "owner") return { error: "Only the organization owner can delete the organization." }

  const admin = createAdminClient()

  // Collect members before the org row (and its memberships) is gone.
  const { data: members, error: membersError } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", org.orgId)
  if (membersError) return { error: "Could not delete the organization. Please try again." }

  try {
    await deleteOrganizationData(admin, org.orgId)
  } catch (err) {
    console.error("[settings] org delete failed:", org.orgId, err instanceof Error ? err.message : err)
    const billing = err instanceof Error && /subscription/i.test(err.message)
    return {
      error: billing
        ? "We couldn't cancel your subscription, so nothing was deleted. Please contact support@vantagedonorai.com."
        : "Could not delete the organization. Nothing further was removed; please try again or contact support@vantagedonorai.com.",
    }
  }

  // Logins left with no organization go too; otherwise the next sign-in
  // would silently create a fresh empty org with a new trial.
  const { failed } = await removeOrphanedLogins(
    admin,
    (members ?? []).map((m: { user_id: string }) => m.user_id)
  )
  if (failed.length > 0) {
    console.error("[settings] org deleted but some logins remain:", org.orgId, failed)
    return {
      warning: `${failed.length} team login${failed.length === 1 ? "" : "s"} couldn't be removed. Email support@vantagedonorai.com and we'll finish it.`,
    }
  }
  return {}
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

/** QuickBooks write-back opt-in (Settings → Integrations). */
export async function getQBWritebackEnabled(): Promise<boolean> {
  const org = await getCurrentUserOrg()
  if (!org) return false
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("organizations")
    .select("qb_writeback_enabled")
    .eq("id", org.orgId)
    .maybeSingle()
  return !!data?.qb_writeback_enabled
}

export async function setQBWritebackEnabled(enabled: boolean): Promise<void> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) throw new Error("Unauthorized")
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new Error("Only owners and admins can change QuickBooks settings.")
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("organizations")
    .update({ qb_writeback_enabled: enabled })
    .eq("id", ctx.orgId)
  if (error) throw new Error(error.message)
}
