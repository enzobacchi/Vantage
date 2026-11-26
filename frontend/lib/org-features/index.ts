import { logAuditEvent } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/admin"

import { ORG_FEATURES, ORG_FEATURE_KEYS, isOrgFeatureKey, type OrgFeatureKey } from "./registry"

export { ORG_FEATURES, ORG_FEATURE_KEYS, isOrgFeatureKey, type OrgFeatureKey }

/**
 * Per-organisation feature switches.
 *
 * One question, one place: "is this feature on for this org?" Pages, server
 * actions, API routes and Scout tools all ask `isFeatureEnabled` with an
 * org id they already derived from the signed-in user — never one supplied by
 * the client. Server-only (uses the service-role client).
 */

export type FeaturesAdmin = ReturnType<typeof createAdminClient>
export type ResolvedFeatures = Record<OrgFeatureKey, boolean>

/** Combine the registry defaults with one org's switches. Pure. */
export function resolveFeatures(
  switches: ReadonlyArray<{ feature_key: string; enabled: boolean }>
): ResolvedFeatures {
  const resolved = {} as ResolvedFeatures
  for (const key of ORG_FEATURE_KEYS) resolved[key] = ORG_FEATURES[key].onForEveryone
  for (const row of switches) {
    if (isOrgFeatureKey(row.feature_key)) resolved[row.feature_key] = row.enabled
  }
  return resolved
}

/**
 * Every feature's state for one org. If the lookup fails, falls back to the
 * registry defaults: a partner-only feature disappears rather than leaking to
 * an org it was never switched on for.
 */
export async function getOrgFeatures(
  orgId: string,
  admin: FeaturesAdmin = createAdminClient()
): Promise<ResolvedFeatures> {
  const { data, error } = await admin
    .from("org_features")
    .select("feature_key, enabled")
    .eq("org_id", orgId)
  if (error) {
    console.error("[org-features] lookup failed, using defaults:", error.message)
    return resolveFeatures([])
  }
  return resolveFeatures(data ?? [])
}

export async function isFeatureEnabled(
  orgId: string,
  key: OrgFeatureKey,
  admin: FeaturesAdmin = createAdminClient()
): Promise<boolean> {
  return (await getOrgFeatures(orgId, admin))[key]
}

/**
 * Switch a feature on or off for one org and record it in the audit log.
 * Not a server action: the caller must already have established that the
 * actor is allowed to flip switches.
 */
export async function setOrgFeature(
  input: { orgId: string; key: OrgFeatureKey; enabled: boolean; actorUserId: string },
  admin: FeaturesAdmin = createAdminClient()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isOrgFeatureKey(input.key)) return { ok: false, error: `Unknown feature "${input.key}"` }

  const { error } = await admin.from("org_features").upsert(
    {
      org_id: input.orgId,
      feature_key: input.key,
      enabled: input.enabled,
      updated_by: input.actorUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,feature_key" }
  )
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({
    orgId: input.orgId,
    userId: input.actorUserId,
    action: input.enabled ? "org_feature.enabled" : "org_feature.disabled",
    entityType: "org_feature",
    summary: `${ORG_FEATURES[input.key].label} switched ${input.enabled ? "on" : "off"}`,
    details: { feature: input.key, enabled: input.enabled },
  })
  return { ok: true }
}
