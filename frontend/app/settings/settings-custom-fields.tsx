"use client"

import * as React from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomFieldDefinitions,
  updateCustomFieldDefinition,
  type CustomFieldDefinition,
  type CustomFieldType,
} from "@/app/actions/custom-fields"
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
import { Badge } from "@/components/ui/badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
}

export function SettingsCustomFields() {
  const [loading, setLoading] = React.useState(true)
  const [fields, setFields] = React.useState<CustomFieldDefinition[]>([])
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CustomFieldDefinition | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Add form state
  const [newLabel, setNewLabel] = React.useState("")
  const [newType, setNewType] = React.useState<CustomFieldType>("text")
  const [newOptions, setNewOptions] = React.useState("")

  // Edit form state
  const [editLabel, setEditLabel] = React.useState("")
  const [editOptions, setEditOptions] = React.useState("")

  const load = React.useCallback(async () => {
    try {
      setFields(await getCustomFieldDefinitions())
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function handleAdd() {
    try {
      setSaving(true)
      await createCustomFieldDefinition({
        label: newLabel,
        field_type: newType,
        options:
          newType === "select"
            ? newOptions.split(",").map((o) => o.trim()).filter(Boolean)
            : undefined,
      })
      toast.success(`Added "${newLabel.trim()}"`)
      setAddOpen(false)
      setNewLabel("")
      setNewType("text")
      setNewOptions("")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add custom field")
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editing) return
    try {
      setSaving(true)
      await updateCustomFieldDefinition(editing.id, {
        label: editLabel,
        options:
          editing.field_type === "select"
            ? editOptions.split(",").map((o) => o.trim()).filter(Boolean)
            : undefined,
      })
      toast.success("Custom field updated")
      setEditing(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update custom field")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(field: CustomFieldDefinition) {
    try {
      await deleteCustomFieldDefinition(field.id)
      toast.success(`Deleted "${field.label}"`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete custom field")
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Custom Fields</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define extra fields for donor profiles — tracked in imports, exports,
          and the API. Anything stored here is included in data you share
          through those channels.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Donor Fields</CardTitle>
            <CardDescription>
              Up to 20 fields. Renaming a field keeps existing values; deleting
              one hides its values everywhere.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-1.5" strokeWidth={1.5} />
            Add Field
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : fields.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No custom fields yet. Add one to start tracking extra donor data.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {fields.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{f.label}</span>
                      <Badge variant="secondary" className="text-xs">
                        {FIELD_TYPE_LABELS[f.field_type]}
                      </Badge>
                    </div>
                    {f.field_type === "select" && f.options && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {f.options.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(f)
                        setEditLabel(f.label)
                        setEditOptions((f.options ?? []).join(", "))
                      }}
                    >
                      <Pencil className="size-3.5" strokeWidth={1.5} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Trash2 className="size-3.5 text-destructive" strokeWidth={1.5} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &quot;{f.label}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The field disappears from donor profiles, imports,
                            and exports. Existing values stay stored but won&apos;t
                            be shown anywhere.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <Button variant="destructive" onClick={() => handleDelete(f)}>
                            Delete
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cf-label">Label</Label>
              <Input
                id="cf-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Mailing List, Member Since"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cf-type">Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as CustomFieldType)}>
                <SelectTrigger id="cf-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newType === "select" && (
              <div className="grid gap-2">
                <Label htmlFor="cf-options">Options (comma-separated)</Label>
                <Input
                  id="cf-options"
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                  placeholder="e.g. Yes, No, Maybe"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !newLabel.trim()}>
              {saving ? "Adding..." : "Add Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Custom Field</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cf-edit-label">Label</Label>
              <Input
                id="cf-edit-label"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
              />
            </div>
            {editing?.field_type === "select" && (
              <div className="grid gap-2">
                <Label htmlFor="cf-edit-options">Options (comma-separated)</Label>
                <Input
                  id="cf-edit-options"
                  value={editOptions}
                  onChange={(e) => setEditOptions(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving || !editLabel.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
