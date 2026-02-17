"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type ReportFolder = {
  id: string
  name: string
  organization_id: string
}

export async function getFolders(): Promise<ReportFolder[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("report_folders")
    .select("id,name,organization_id")
    .eq("organization_id", org.orgId)
    .order("name", { ascending: true })

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return []
    }
    throw new Error(error.message)
  }
  return (data ?? []) as ReportFolder[]
}

export async function createFolder(name: string): Promise<ReportFolder> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const trimmed = name.trim()
  if (!trimmed) throw new Error("Folder name is required.")

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("report_folders")
    .insert({
      name: trimmed,
      organization_id: org.orgId,
    })
    .select("id,name,organization_id")
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Failed to create folder.")
  return data as ReportFolder
}

export async function deleteFolder(id: string): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("report_folders")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)

  if (error) throw new Error(error.message)
}

export async function moveReportToFolder(
  reportId: string,
  folderId: string | null
): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  if (folderId !== null) {
    const { data: folder } = await supabase
      .from("report_folders")
      .select("id")
      .eq("id", folderId)
      .eq("organization_id", org.orgId)
      .single()
    if (!folder) throw new Error("Folder not found.")
  }

  const { error } = await supabase
    .from("saved_reports")
    .update({ folder_id: folderId })
    .eq("id", reportId)
    .eq("organization_id", org.orgId)

  if (error) throw new Error(error.message)
}
