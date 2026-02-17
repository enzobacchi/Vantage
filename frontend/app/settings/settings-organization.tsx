"use client"

import * as React from "react"
import { IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { getOrganization, updateOrganization } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SettingsOrganization() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [websiteUrl, setWebsiteUrl] = React.useState("")
  const [logoUrl, setLogoUrl] = React.useState("")

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

      {/* Danger Zone - visual only */}
      <div className="space-y-4 rounded-lg border border-destructive/50 bg-destructive/5 p-6 dark:border-destructive/30 dark:bg-destructive/10">
        <div>
          <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
          <p className="text-[0.8rem] text-muted-foreground mt-0.5">
            Permanently delete this organization and all associated data. This action cannot be undone.
          </p>
        </div>
        <Button variant="destructive" size="default" className="h-9 rounded-md px-4 gap-2" disabled>
          <IconTrash className="size-4" />
          Delete Organization
        </Button>
      </div>
    </div>
  )
}
