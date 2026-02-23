"use server"

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg, getCurrentUserOrgWithRole } from "@/lib/auth"

const INVITE_FROM_EMAIL = "Vantage <onboarding@resend.dev>"

export type OrgMember = {
  id: string
  user_id: string
  email: string
  name: string
  role: string
  created_at: string
}

export type Invitation = {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

export async function getOrganizationMembers(): Promise<OrgMember[]> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return []

  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, created_at")
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false })

  if (error || !rows?.length) return []

  const members: OrgMember[] = []
  for (const row of rows as { id: string; user_id: string; role: string; created_at: string }[]) {
    const { data: user } = await supabase.auth.admin.getUserById(row.user_id)
    const email = user?.user?.email ?? ""
    const name =
      (user?.user?.user_metadata?.full_name as string) ??
      (user?.user?.user_metadata?.name as string) ??
      email?.split("@")[0] ??
      "—"
    members.push({
      id: row.id,
      user_id: row.user_id,
      email,
      name: String(name).trim() || "—",
      role: row.role,
      created_at: row.created_at,
    })
  }
  return members
}

function canManageTeam(role: string): boolean {
  return role === "owner" || role === "admin"
}

export async function createInvitation(
  email: string,
  role: "admin" | "member"
): Promise<{ link: string; error?: string }> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return { link: "", error: "Unauthorized" }
  if (!canManageTeam(ctx.role)) return { link: "", error: "Only owners and admins can invite." }

  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return { link: "", error: "Email is required." }

  const supabase = createAdminClient()
  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 48)

  const { error } = await supabase.from("invitations").insert({
    email: trimmed,
    organization_id: ctx.orgId,
    token,
    role,
    expires_at: expiresAt.toISOString(),
  })

  if (error) return { link: "", error: error.message }
  return { link: `/join?token=${encodeURIComponent(token)}` }
}

/**
 * Sends the invite link to the invitee's email. Call after createInvitation.
 * Requires RESEND_API_KEY. Fails gracefully if email is not configured.
 */
export async function sendInviteEmail(
  toEmail: string,
  inviteLinkFullUrl: string,
  role: "admin" | "member"
): Promise<{ error?: string }> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return { error: "Unauthorized" }
  if (!canManageTeam(ctx.role)) return { error: "Only owners and admins can invite." }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { error: "Email is not configured. Invite link was still created—copy and share it manually." }

  const supabase = createAdminClient()
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", ctx.orgId)
    .single()
  const orgName = (org as { name?: string } | null)?.name ?? "the team"

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: INVITE_FROM_EMAIL,
    to: toEmail.trim().toLowerCase(),
    subject: `You're invited to join ${orgName}`,
    html: `
      <p>You've been invited to join <strong>${orgName.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong> as a ${role}.</p>
      <p><a href="${inviteLinkFullUrl.replace(/"/g, "&quot;")}">Accept invite</a></p>
      <p>Or copy this link: ${inviteLinkFullUrl.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      <p>This link expires in 48 hours.</p>
    `.trim(),
  })

  if (error) return { error: error.message }
  return {}
}

export async function revokeInvitation(id: string): Promise<{ error?: string }> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return { error: "Unauthorized" }
  if (!canManageTeam(ctx.role)) return { error: "Only owners and admins can revoke invites." }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.orgId)

  if (error) return { error: error.message }
  return {}
}

export async function getCanManageTeam(): Promise<boolean> {
  const ctx = await getCurrentUserOrgWithRole()
  return ctx ? canManageTeam(ctx.role) : false
}

export async function getCurrentMemberInfo(): Promise<{ userId: string; role: string } | null> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return null
  return { userId: ctx.userId, role: ctx.role }
}

/**
 * Change a member's role. Owner-only. Prevents removing the last owner.
 * memberId is the organization_members.id (not user_id).
 */
export async function updateMemberRole(
  memberId: string,
  newRole: "owner" | "admin" | "member"
): Promise<{ error?: string }> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return { error: "Unauthorized" }
  if (ctx.role !== "owner") return { error: "Only owners can change member roles." }

  const supabase = createAdminClient()

  // Fetch the target member to check their current role
  const { data: target } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle()

  if (!target) return { error: "Member not found." }

  // Prevent demoting the last owner
  if ((target as { role: string }).role === "owner" && newRole !== "owner") {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.orgId)
      .eq("role", "owner")
    if (count !== null && count <= 1) {
      return { error: "Cannot remove the last owner. Promote another member to owner first." }
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("organization_id", ctx.orgId)

  if (error) return { error: error.message }
  return {}
}

export async function getPendingInvitations(): Promise<Invitation[]> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx || !canManageTeam(ctx.role)) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", ctx.orgId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })

  if (error) return []
  return (data ?? []) as Invitation[]
}

export async function getInvitationPreview(token: string): Promise<{
  orgName?: string
  email?: string
  error?: string
}> {
  if (!token?.trim()) return { error: "Missing token." }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("invitations")
    .select("organization_id, email")
    .eq("token", token.trim())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  if (error || !data) return { error: "Invalid or expired invite." }
  const inv = data as { organization_id: string; email: string }
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", inv.organization_id)
    .single()
  return {
    orgName: (org as { name?: string } | null)?.name ?? "this organization",
    email: inv.email,
  }
}

export async function acceptInvitation(token: string): Promise<{ error?: string; orgName?: string }> {
  const { createServerSupabaseClient } = await import("@/lib/supabase/server")
  const supabaseAuth = await createServerSupabaseClient()
  const {
    data: { user },
    error: sessionError,
  } = await supabaseAuth.auth.getUser()
  if (sessionError || !user?.id) return { error: "You must be logged in to accept an invite." }

  const admin = createAdminClient()
  const { data: invite, error: findError } = await admin
    .from("invitations")
    .select("id, organization_id, role, email")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (findError || !invite) {
    return { error: "Invalid or expired invite link." }
  }

  const inv = invite as { id: string; organization_id: string; role: string; email: string }
  const inviteEmail = (inv.email ?? "").trim().toLowerCase()
  const currentEmail = (user.email ?? "").trim().toLowerCase()
  if (inviteEmail && currentEmail !== inviteEmail) {
    return {
      error: `This invite was sent to ${inv.email}. You're signed in as ${user.email}. Sign out and open this link again to sign in or create an account with the invited email.`,
    }
  }

  const ctx = { userId: user.id, orgId: inv.organization_id }

  const { error: upsertError } = await admin.from("organization_members").upsert(
    {
      user_id: ctx.userId,
      organization_id: inv.organization_id,
      role: inv.role,
    },
    { onConflict: "user_id,organization_id" }
  )

  if (upsertError) return { error: upsertError.message }

  await admin.from("invitations").delete().eq("id", inv.id)

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", inv.organization_id)
    .single()

  return { orgName: (org as { name?: string } | null)?.name ?? undefined }
}
