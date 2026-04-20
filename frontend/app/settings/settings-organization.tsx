"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { deleteOrganization, getOrganization, getOrganizationRole, updateOrganization } from "@/app/actions/settings"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const
import { createBrowserSupabaseClient } from "@/lib/supabase/client"

export function SettingsOrganization() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [role, setRole] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [logoUrl, setLogoUrl] = React.useState("")
  const [taxId, setTaxId] = React.useState("")
  const [legalWording, setLegalWording] = React.useState("")
  const [fyStartMonth, setFyStartMonth] = React.useState<number>(1)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const [org, userRole] = await Promise.all([getOrganization(), getOrganizationRole()])
      if (org) {
        setName(org.name ?? "")
        setLogoUrl(org.logo_url ?? "")
        setTaxId(org.tax_id ?? "")
        setLegalWording(org.legal_501c3_wording ?? "")
        setFyStartMonth(org.fiscal_year_start_month ?? 1)
      }
      setRole(userRole)
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
        website_url: "",
        logo_url: logoUrl.trim(),
        tax_id: taxId.trim(),
        legal_501c3_wording: legalWording.trim(),
        fiscal_year_start_month: fyStartMonth,
      })
      toast.success("Organization updated")
      router.refresh()
    } catch (e) {
      toast.error("Failed to save", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowed.includes(file.type)) {
      toast.error("Invalid file type", { description: "Use PNG, JPEG, or WebP." })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum size is 2 MB." })
      return
    }
    try {
      setUploading(true)
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/organization/logo", {
        method: "POST",
        body: formData,
      })
      const data = (await res.json()) as { url?: string; error?: string; details?: string }
      if (!res.ok) {
        throw new Error(data.details ?? data.error ?? "Upload failed")
      }
      if (data.url) {
        setLogoUrl(data.url)
        toast.success("Logo uploaded")
        router.refresh()
      }
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowed.includes(file.type)) {
      toast.error("Invalid file type", { description: "Use PNG, JPEG, or WebP." })
      return
    }
    const input = fileInputRef.current
    if (input) {
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event("change", { bubbles: true }))
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
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
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Your ministry or organization details shown across the platform, including the logo and name in the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
      {role !== "owner" ? (
        <div className="space-y-4">
          {logoUrl && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex shrink-0 items-center justify-center size-12 rounded-lg border border-border bg-muted overflow-hidden">
                  <img src={logoUrl} alt="Organization logo" className="size-10 object-contain" />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ministry name</Label>
            <p className="text-sm text-foreground">{name || <span className="text-muted-foreground">—</span>}</p>
          </div>
          {taxId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tax ID (EIN)</Label>
              <p className="text-sm text-foreground">{taxId}</p>
            </div>
          )}
          <p className="text-[0.8rem] text-muted-foreground pt-2">
            Only the organization owner can edit these settings.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-2">
            <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Logo
            </Label>
            <p className="text-[0.8rem] text-muted-foreground">
              Upload your organization logo. Shown in the sidebar. PNG, JPEG, or WebP, max 2 MB.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => role === "owner" && !uploading && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted transition-colors hover:border-muted-foreground/30 hover:bg-accent ${
                uploading ? "pointer-events-none opacity-60" : ""
              } ${role !== "owner" ? "cursor-default" : ""}`}
            >
              {logoUrl && !uploading ? (
                <img
                  src={logoUrl}
                  alt="Organization logo"
                  className="size-20 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
              ) : (
                <div className="flex size-20 items-center justify-center">
                  {uploading ? (
                    <span className="text-xs text-muted-foreground">Uploading…</span>
                  ) : (
                    <Upload className="size-8 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
              )}
            </div>
            {logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 gap-1.5"
                onClick={() => {
                  setLogoUrl("")
                  toast.success("Logo removed — save changes to confirm")
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={1.5} />
                Remove logo
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Ministry name
            </Label>
            <p className="text-[0.8rem] text-muted-foreground mt-1.5">
              The display name of your organization, shown in the sidebar.
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
            <Label htmlFor="org-tax-id" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Tax ID (EIN)
            </Label>
            <p className="text-[0.8rem] text-muted-foreground mt-1.5">
              Required for Standard tax-deductible receipts. Shown on acknowledgment letters.
            </p>
            <Input
              id="org-tax-id"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="e.g. 12-3456789"
              className="mt-2 h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-legal-wording" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              501(c)(3) legal wording
            </Label>
            <p className="text-[0.8rem] text-muted-foreground mt-1.5">
              Standard disclaimer for tax-deductible receipts. Appended to Standard acknowledgment letters.
            </p>
            <textarea
              id="org-legal-wording"
              value={legalWording}
              onChange={(e) => setLegalWording(e.target.value)}
              placeholder="e.g. No goods or services were provided in exchange for this contribution. Tax ID is provided for your records."
              className="mt-2 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-fy-start" className="text-sm font-medium leading-none">
              Fiscal year starts in
            </Label>
            <p className="text-[0.8rem] text-muted-foreground mt-1.5">
              Used by report templates to compute "this fiscal year" and "last fiscal year". Default: January (calendar year).
            </p>
            <Select
              value={String(fyStartMonth)}
              onValueChange={(v) => setFyStartMonth(Number(v))}
            >
              <SelectTrigger id="org-fy-start" className="mt-2 h-9 w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button size="default" className="h-9 rounded-md px-4" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
        </CardContent>
      </Card>

      {/* Danger Zone — owner only */}
      {role === "owner" && <div className="space-y-4 rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <div>
          <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
          <p className="text-[0.8rem] text-muted-foreground mt-0.5">
            Permanently delete this organization and all associated data. This action cannot be undone.
          </p>
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm("") }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="default" className="h-9 rounded-md px-4 gap-2">
              <Trash2 className="size-4" strokeWidth={1.5} />
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
      </div>}
    </div>
  )
}
