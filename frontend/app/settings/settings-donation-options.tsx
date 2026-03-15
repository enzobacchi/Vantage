"use client"

import * as React from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createOrgDonationOption,
  deleteOrgDonationOption,
  getOrgDonationOptions,
  updateOrgDonationOption,
  type OrgDonationOptionRow,
} from "@/app/actions/donations"
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type OptionType = "category" | "campaign" | "fund"

const TYPE_LABELS: Record<OptionType, string> = {
  category: "Donation Categories",
  campaign: "Campaigns",
  fund: "Funds",
}

const TYPE_DESCRIPTIONS: Record<OptionType, string> = {
  category: "Categorize donations (e.g. General, Memorial, Event).",
  campaign: "Track donations by campaign (e.g. Capital Campaign, Annual Fund).",
  fund: "Assign donations to funds (e.g. Building Fund, Missions).",
}

function OptionSection({
  type,
  options,
  onRefresh,
}: {
  type: OptionType
  options: OrgDonationOptionRow[]
  onRefresh: () => void
}) {
  const [addOpen, setAddOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [editingOption, setEditingOption] = React.useState<OrgDonationOptionRow | null>(null)
  const [editName, setEditName] = React.useState("")
  const [deletingOption, setDeletingOption] = React.useState<OrgDonationOptionRow | null>(null)

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      toast.error("Name is required")
      return
    }
    try {
      setSaving(true)
      await createOrgDonationOption(type, trimmed)
      toast.success("Added")
      setNewName("")
      setAddOpen(false)
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editingOption) return
    const trimmed = editName.trim()
    if (!trimmed) {
      toast.error("Name is required")
      return
    }
    try {
      setSaving(true)
      await updateOrgDonationOption(editingOption.id, { name: trimmed })
      toast.success("Updated")
      setEditOpen(false)
      setEditingOption(null)
      setEditName("")
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingOption) return
    try {
      setSaving(true)
      await deleteOrgDonationOption(deletingOption.id)
      toast.success("Deleted")
      setDeletingOption(null)
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    } finally {
      setSaving(false)
    }
  }

  const openDelete = (opt: OrgDonationOptionRow) => setDeletingOption(opt)

  const openEdit = (opt: OrgDonationOptionRow) => {
    setEditingOption(opt)
    setEditName(opt.name)
    setEditOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{TYPE_LABELS[type]}</CardTitle>
        <CardDescription>{TYPE_DESCRIPTIONS[type]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <div
              key={opt.id}
              className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm"
            >
              <span>{opt.name}</span>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => openEdit(opt)}
                  aria-label={`Edit ${opt.name}`}
                >
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => openDelete(opt)}
                  aria-label={`Delete ${opt.name}`}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          ))}
        <AlertDialog open={!!deletingOption} onOpenChange={(o) => !o && setDeletingOption(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{deletingOption?.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                Donations using this option will have it cleared. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-dashed"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" strokeWidth={1.5} />
              Add
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add {TYPE_LABELS[type].slice(0, -1)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-name">Name</Label>
                  <Input
                    id="new-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. General Fund"
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={saving || !newName.trim()}>
                  {saving ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={editOpen} onOpenChange={(o) => !o && setEditingOption(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {TYPE_LABELS[type].slice(0, -1)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEdit} disabled={saving || !editName.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export function SettingsDonationOptions() {
  const [loading, setLoading] = React.useState(true)
  const [categories, setCategories] = React.useState<OrgDonationOptionRow[]>([])
  const [campaigns, setCampaigns] = React.useState<OrgDonationOptionRow[]>([])
  const [funds, setFunds] = React.useState<OrgDonationOptionRow[]>([])

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const [cats, camps, fnds] = await Promise.all([
        getOrgDonationOptions("category"),
        getOrgDonationOptions("campaign"),
        getOrgDonationOptions("fund"),
      ])
      setCategories(cats)
      setCampaigns(camps)
      setFunds(fnds)
    } catch {
      toast.error("Failed to load options")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Custom Donation Options</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define dropdown options for Donation Categories, Campaigns, and Funds. These appear when logging donations and can be used for filtering and reporting.
        </p>
      </div>
      <div className="space-y-6">
        <OptionSection type="category" options={categories} onRefresh={load} />
        <OptionSection type="campaign" options={campaigns} onRefresh={load} />
        <OptionSection type="fund" options={funds} onRefresh={load} />
      </div>
    </div>
  )
}
