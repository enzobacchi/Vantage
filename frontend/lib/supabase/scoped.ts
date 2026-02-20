import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Org-scoped query builders for use with the admin client.
 * Always call requireUserOrg() (or getCurrentUserOrg()) first, then pass auth.orgId here.
 * This ensures all donor, report, and other org-scoped data access is filtered by org.
 *
 * Use these helpers in API routes and server actions to avoid missing org_id/organization_id filters.
 */
export function donorsQuery(supabase: AdminClient, orgId: string) {
  return supabase.from("donors").eq("org_id", orgId);
}

export function savedReportsQuery(supabase: AdminClient, orgId: string) {
  return supabase.from("saved_reports").eq("organization_id", orgId);
}

export function tasksQuery(supabase: AdminClient, orgId: string) {
  return supabase.from("tasks").eq("organization_id", orgId);
}

export function opportunitiesQuery(supabase: AdminClient, orgId: string) {
  return supabase.from("opportunities").eq("organization_id", orgId);
}
