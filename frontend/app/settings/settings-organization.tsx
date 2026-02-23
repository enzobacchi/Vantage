"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { deleteOrganization, getOrganization, updateOrganization } from "@/app/actions/settings"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"

export function SettingsOrganization() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [websiteUrl, setWebsiteUrl] = React.useState("")
  const [logoUrl, setLogoUrl] = React.useState("")

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const org = await getOrganization()
      if (org) {
        setName(org.name ?? "")
        setWebsiteUrl(org.website_url ?? "")
        setLogoUrl(org.logo_url ?? "")
      }
    } catch {
      toast.error("Failed to load organization")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    try {
      setSaving(true)
      await updateOrganization({
        name: name.trim(),
        website_url: websiteUrl.trim(),
        logo_url: logoUrl.trim(),
      })
      toast.success("Organization updated")
    } catch (e) {
      toast.error("Failed to save", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)
      await deleteOrganization()
      toast.success("Organization deleted")
      const supabase = createBrowserSupabaseClient()
      await supabase.auth.signOut()
      router.push("/login")
      router.refresh()
    } catch (e) {
      toast.error("Failed to delete organization", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading organization…</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">Organization</h3>
        <p className="text-[0.8rem] text-muted-foreground mt-0.5">
          Your ministry or organization details shown across the platform.
        </p>
      </div>

      <div className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="org-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Ministry name
          </Label>
          <p className="text-[0.8rem] text-muted-foreground mt-1.5">
            The display name of your organization.
          </p>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grace Community Church"
            className="mt-2 h-9"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-website" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Website URL
          </Label>
          <p className="text-[0.8rem] text-muted-foreground mt-1.5">
            Your organization&apos;s public website.
          </p>
          <Input
            id="org-website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://…"
            className="mt-2 h-9"
          />
        </div>

        <div>
          <Button size="default" className="h-9 rounded-md px-4" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4 rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <div>
          <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
          <p className="text-[0.8rem] text-muted-foreground mt-0.5">
            Permanently delete this organization and all associated data. This action cannot be undone.
          </p>
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm("") }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="default" className="h-9 rounded-md px-4 gap-2">
              <IconTrash className="size-4" />
              Delete Organization
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete organization?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{name || "this organization"}</strong> and all of its data — donors, donations, reports, tags, and everything else. There is no way to recover this data.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2 py-2">
              <Label htmlFor="delete-confirm" className="text-sm">
                Type <strong>DELETE</strong> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={deleteConfirm !== "DELETE" || deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Delete everything"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
