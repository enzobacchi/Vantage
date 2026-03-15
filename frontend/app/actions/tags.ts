"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type Tag = {
  id: string
  name: string
  color: string
  created_at?: string
}

/**
 * Create a new tag for the current organization. Name must be unique per org.
 */
export async function createTag(name: string, color: string): Promise<Tag> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const trimmed = name.trim()
  if (!trimmed) throw new Error("Tag name is required")

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("tags")
    .insert({
      organization_id: org.orgId,
      name: trimmed,
      color: color || "gray",
    })
    .select("id,name,color,created_at")
    .single()

  if (error) {
    if (error.code === "23505") throw new Error("A tag with this name already exists.")
    throw new Error(error.message)
  }

  revalidatePath("/dashboard")
  revalidatePath("/donors")
  return data as Tag
}

/**
 * Assign a tag to a donor. Idempotent (no-op if already assigned).
 */
export async function assignTag(donorId: string, tagId: string): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const { error } = await supabase.from("donor_tags").upsert(
    { donor_id: donorId, tag_id: tagId },
    { onConflict: "donor_id,tag_id" }
  )

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard")
  revalidatePath(`/donors/${donorId}`)
}

/**
 * Remove a tag from a donor.
 */
export async function removeTag(donorId: string, tagId: string): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("donor_tags")
    .delete()
    .eq("donor_id", donorId)
    .eq("tag_id", tagId)

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard")
  revalidatePath(`/donors/${donorId}`)
}

/**
 * Assign a tag to multiple donors. Idempotent (no-op if already assigned).
 * Returns the number of donors successfully tagged.
 */
export async function bulkAssignTag(
  donorIds: string[],
  tagId: string
): Promise<number> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")
  if (donorIds.length === 0) return 0

  const supabase = createAdminClient()

  const { data: orgDonors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", org.orgId)
    .in("id", donorIds)
  const validDonorIds = new Set((orgDonors ?? []).map((d: { id: string }) => d.id))

  if (validDonorIds.size === 0) return 0

  const rows = [...validDonorIds].map((donorId) => ({
    donor_id: donorId,
    tag_id: tagId,
  }))

  const { error } = await supabase.from("donor_tags").upsert(rows, {
    onConflict: "donor_id,tag_id",
  })

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard")
  revalidatePath("/donors")
  return validDonorIds.size
}

/**
 * Remove a tag from multiple donors.
 * Returns the number of donors successfully untagged.
 */
export async function bulkRemoveTag(
  donorIds: string[],
  tagId: string
): Promise<number> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")
  if (donorIds.length === 0) return 0

  const supabase = createAdminClient()

  const { data: orgDonors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", org.orgId)
    .in("id", donorIds)
  const validDonorIds = (orgDonors ?? []).map((d: { id: string }) => d.id)

  if (validDonorIds.length === 0) return 0

  const { error } = await supabase
    .from("donor_tags")
    .delete()
    .eq("tag_id", tagId)
    .in("donor_id", validDonorIds)

  if (error) throw new Error(error.message)

  revalidatePath("/dashboard")
  revalidatePath("/donors")
  return validDonorIds.length
}

/**
 * Fetch all tags for the current organization (for filter menu and tag picker).
 */
export async function getOrganizationTags(): Promise<Tag[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("tags")
    .select("id,name,color,created_at")
    .eq("organization_id", org.orgId)
    .order("name")

  if (error) throw new Error(error.message)
  return (data ?? []) as Tag[]
}

/**
 * Fetch tags assigned to a single donor (for profile display).
 */
export async function getDonorTags(donorId: string): Promise<Tag[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data: donor } = await supabase
    .from("donors")
    .select("id")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (!donor) return []

  const { data: rows, error } = await supabase
    .from("donor_tags")
    .select("tag_id")
    .eq("donor_id", donorId)

  if (error || !rows?.length) return []

  const tagIds = rows.map((r) => r.tag_id)
  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id,name,color,created_at")
    .in("id", tagIds)

  if (tagsError) return []
  return (tags ?? []) as Tag[]
}
