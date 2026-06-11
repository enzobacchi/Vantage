"use client"

import * as React from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"

import {
  getCustomFieldDefinitions,
  updateDonorCustomFields,
  type CustomFieldDefinition,
} from "@/app/actions/custom-fields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

const CLEAR_VALUE = "__clear__"

/**
 * Donor detail card for org-defined custom fields. Renders nothing while the
 * org has no definitions, so it costs no vertical space for orgs that don't
 * use the feature.
 */
export function DonorCustomFieldsCard({
  donorId,
  values,
  onSaved,
}: {
  donorId: string
  values: Record<string, string> | null
  onSaved: () => void
}) {
  const [definitions, setDefinitions] = React.useState<CustomFieldDefinition[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [form, setForm] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    getCustomFieldDefinitions()
      .then(setDefinitions)
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded || definitions.length === 0) return null

  const openEdit = () => {
    const initial: Record<string, string> = {}
    for (const d of definitions) initial[d.key] = values?.[d.key] ?? ""
    setForm(initial)
    setEditOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, string | null> = {}
      for (const d of definitions) payload[d.key] = form[d.key] || null
      await updateDonorCustomFields(donorId, payload)
      toast.success("Custom fields updated")
      setEditOpen(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update custom fields")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Custom Fields</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEdit}>
            <Pencil className="size-3.5" strokeWidth={1.5} />
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2.5">
            {definitions.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-muted-foreground shrink-0">{d.label}</dt>
                <dd className="text-sm text-right truncate">
                  {values?.[d.key] || (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Custom Fields</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {definitions.map((d) => (
              <div key={d.key} className="grid gap-2">
                <Label htmlFor={`cf-${d.key}`}>{d.label}</Label>
                {d.field_type === "select" ? (
                  <Select
                    value={form[d.key] || CLEAR_VALUE}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, [d.key]: v === CLEAR_VALUE ? "" : v }))
                    }
                  >
                    <SelectTrigger id={`cf-${d.key}`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CLEAR_VALUE}>
                        <span className="text-muted-foreground">—</span>
                      </SelectItem>
                      {(d.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`cf-${d.key}`}
                    type={
                      d.field_type === "number"
                        ? "number"
                        : d.field_type === "date"
                          ? "date"
                          : "text"
                    }
                    value={form[d.key] ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [d.key]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
