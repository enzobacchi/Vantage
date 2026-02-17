"use client"

import * as React from "react"
import { IconFilePlus } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createReportFromCrm, type CrmFilters } from "@/app/actions/reports"
import type { LifecycleConfig } from "@/lib/donor-lifecycle"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Column options for CRM report (must match report API column ids). */
const COLUMN_GROUPS = [
  {
    title: "Identity",
    columns: [
      { id: "first_name", label: "First Name" },
      { id: "last_name", label: "Last Name" },
      { id: "display_name", label: "Display Name" },
      { id: "email", label: "Email" },
      { id: "phone", label: "Phone" },
    ],
  },
  {
    title: "Location",
    columns: [
      { id: "street_address", label: "Street" },
      { id: "city", label: "City" },
      { id: "state", label: "State" },
      { id: "zip", label: "Zip" },
    ],
  },
  {
    title: "Giving History",
    columns: [
      { id: "lifetime_value", label: "Lifetime Value" },
      { id: "last_gift_date", label: "Last Gift Date" },
      { id: "last_gift_amount", label: "Last Gift Amount" },
    ],
  },
] as const

const DEFAULT_COLUMNS = ["first_name", "last_name", "email", "lifetime_value"]

export type SaveReportButtonProps = {
  searchQuery: string
  selectedTagIds: Set<string>
  visibleBadges: Set<string>
  badgeConfig: LifecycleConfig
  onSuccess?: () => void
}

export function SaveReportButton({
  searchQuery,
  selectedTagIds,
  visibleBadges,
  badgeConfig,
  onSuccess,
}: SaveReportButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>(() => [...DEFAULT_COLUMNS])

  React.useEffect(() => {
    if (open) setSelectedColumns((prev) => (prev.length ? prev : [...DEFAULT_COLUMNS]))
  }, [open])

  const toggleColumn = (id: string) => {
    setSelectedColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = name.trim()
    if (!title) {
      toast.error("Enter a report name.")
      return
    }
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column.")
      return
    }

    const filters: CrmFilters = {
      search: searchQuery,
      tagIds: [...selectedTagIds],
      lifecycleConfig: badgeConfig,
      selectedColumns,
    }

    setSaving(true)
    try {
      const { id } = await createReportFromCrm(title, filters)
      toast.success("Report saved", { description: `"${title}" created.` })
      setOpen(false)
      setName("")
      onSuccess?.()
      router.push(`/dashboard?view=saved-reports&reportId=${encodeURIComponent(id)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save report.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 h-9"
        onClick={() => setOpen(true)}
      >
        <IconFilePlus className="size-4 shrink-0" />
        Save as Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save as Report</DialogTitle>
            <DialogDescription>
              Save your current filters as a report and choose which columns to include. The report stores the criteria so new donors that match later will appear when you open it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-name">Report name</Label>
              <Input
                id="report-name"
                placeholder="e.g. Lapsed Board Members"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Columns to include</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                <button type="button" className="underline hover:text-foreground" onClick={() => setSelectedColumns(COLUMN_GROUPS.flatMap((g) => g.columns.map((c) => c.id)))}>
                  Select all
                </button>
                <span>·</span>
                <button type="button" className="underline hover:text-foreground" onClick={() => setSelectedColumns([])}>
                  Clear all
                </button>
              </div>
              <div className="space-y-3 rounded-md border p-3 max-h-[200px] overflow-y-auto">
                {COLUMN_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">{group.title}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {group.columns.map((col) => (
                        <label key={col.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedColumns.includes(col.id)}
                            onCheckedChange={() => toggleColumn(col.id)}
                          />
                          {col.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || selectedColumns.length === 0}>
                {saving ? "Saving…" : "Save report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
