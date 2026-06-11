"use server"

import { logAuditEvent } from "@/app/actions/audit"
import { generateApiKey } from "@/lib/api-auth"
import { getCurrentUserOrgWithRole } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgSubscription } from "@/lib/subscription"

export type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at: string | null
  created_at: string
}

const MAX_KEYS_PER_ORG = 10

function canManage(role: string): boolean {
  return role === "owner" || role === "admin"
}

/** Whether the org's plan includes public API access (Growth and above). */
export async function getApiAccess(): Promise<boolean> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) return false
  const sub = await getOrgSubscription(ctx.orgId)
  if (["growth", "pro", "enterprise"].includes(sub.planId)) return true
  return sub.planId === "trial" && !!sub.trialTier && ["growth", "pro"].includes(sub.trialTier)
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx || !canManage(ctx.role)) return []

  const supabase = createAdminClient()
  const { data } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, created_at")
    .eq("org_id", ctx.orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })

  return (data ?? []) as ApiKeyRow[]
}

/**
 * Create an API key. Returns the plaintext exactly once — it is never stored
 * or shown again.
 */
export async function createApiKey(name: string): Promise<{ plaintext: string }> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) throw new Error("Unauthorized")
  if (!canManage(ctx.role)) throw new Error("Only owners and admins can manage API keys.")

  const trimmed = name.trim()
  if (!trimmed) throw new Error("Key name is required")

  const supabase = createAdminClient()
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .is("revoked_at", null)
  if ((count ?? 0) >= MAX_KEYS_PER_ORG) {
    throw new Error(`You can have up to ${MAX_KEYS_PER_ORG} active API keys.`)
  }

  const { plaintext, keyHash, keyPrefix } = generateApiKey()

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: ctx.orgId,
      name: trimmed,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: ["read"],
      created_by: ctx.userId,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  void logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "create",
    entityType: "api_key",
    entityId: data?.id ?? null,
    summary: `Created API key "${trimmed}"`,
    details: { name: trimmed, keyPrefix },
  }).catch(console.error)

  return { plaintext }
}

export async function revokeApiKey(id: string): Promise<void> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) throw new Error("Unauthorized")
  if (!canManage(ctx.role)) throw new Error("Only owners and admins can manage API keys.")

  const supabase = createAdminClient()
  const { data: key } = await supabase
    .from("api_keys")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (!key) throw new Error("API key not found.")

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) throw new Error(error.message)

  void logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "revoke",
    entityType: "api_key",
    entityId: id,
    summary: `Revoked API key "${(key as { name: string }).name}"`,
  }).catch(console.error)
}
