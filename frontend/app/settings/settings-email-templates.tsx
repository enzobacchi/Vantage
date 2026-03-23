"use client"

import * as React from "react"
import { Mail, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createReceiptTemplate,
  deleteReceiptTemplate,
  listReceiptTemplates,
  updateReceiptTemplate,
  type ReceiptTemplate,
} from "@/app/actions/receipt-templates"
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
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import type { ReceiptTemplateCategory } from "@/types/database"

const CATEGORY_LABELS: Record<ReceiptTemplateCategory, string> = {
  standard: "Standard",
  daf: "DAF (Donor-Advised Fund)",
  institutional: "Institutional",
}

const VARIABLE_HINTS = [
  { token: "{{donor_name}}", label: "Donor name" },
  { token: "{{org_name}}", label: "Organization name" },
  { token: "{{date}}", label: "Today's date" },
]

function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export function applyEmailTemplate(
  template: ReceiptTemplate,
  vars: { donor_name?: string; org_name?: string; date?: string }
): { subject: string; body: string } {
  const resolved = {
    donor_name: vars.donor_name ?? "",
    org_name: vars.org_name ?? "",
    date: vars.date ?? new Date().toLocaleDateString(),
  }
  return {
    subject: applyTemplateVars(template.subject, resolved),
    body: applyTemplateVars(template.body, resolved),
  }
}

type FormState = {
  name: string
  category: ReceiptTemplateCategory
  subject: string
  body: string
}

function TemplateDialog({
  trigger,
  initial,
  onSave,
}: {
  trigger: React.ReactNode
  initial?: Partial<FormState>
  onSave: (data: FormState) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<FormState>({
    name: initial?.name ?? "",
    category: initial?.category ?? "standard",
    subject: initial?.subject ?? "",
    body: initial?.body ?? "",
  })

  React.useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        category: initial?.category ?? "standard",
        subject: initial?.subject ?? "",
        body: initial?.body ?? "",
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error("Template name is required"); return }
    if (!form.subject.trim()) { toast.error("Subject is required"); return }
    if (!form.body.trim()) { toast.error("Body is required"); return }
    setSaving(true)
    try {
      await onSave(form)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.name ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                placeholder="e.g. Year-End Thank You"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as ReceiptTemplateCategory }))}
              >
                <SelectTrigger id="tpl-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ReceiptTemplateCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-subject">Subject line</Label>
            <Input
              id="tpl-subject"
              placeholder="e.g. Thank you for your gift, {{donor_name}}"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-body">Message body</Label>
            </div>
            <Textarea
              id="tpl-body"
              className="min-h-[140px] font-mono text-xs"
              placeholder={"Dear {{donor_name}},\n\nThank you for your generous gift…"}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {VARIABLE_HINTS.map(({ token, label }) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, body: f.body + token }))}
                  className="rounded border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title={`Insert ${label}`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsEmailTemplates() {
  const [templates, setTemplates] = React.useState<ReceiptTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await listReceiptTemplates())
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function handleCreate(data: FormState) {
    const result = await createReceiptTemplate(data)
    if (result.success) {
      toast.success("Template created")
      await load()
    } else {
      toast.error(result.error ?? "Failed to create template")
    }
  }

  async function handleUpdate(id: string, data: FormState) {
    const result = await updateReceiptTemplate(id, data)
    if (result.success) {
      toast.success("Template updated")
      await load()
    } else {
      toast.error(result.error ?? "Failed to update template")
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const result = await deleteReceiptTemplate(id)
      if (result.success) {
        toast.success("Template deleted")
        setTemplates((ts) => ts.filter((t) => t.id !== id))
      } else {
        toast.error(result.error ?? "Failed to delete template")
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4 shrink-0" strokeWidth={1.5} />
            Email Templates
          </CardTitle>
          <CardDescription className="mt-1">
            Create reusable email templates for donor acknowledgments and receipts. Use{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{donor_name}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{org_name}}"}</code>, and{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{date}}"}</code> as placeholders.
          </CardDescription>
        </div>
        <TemplateDialog
          trigger={
            <Button size="sm" className="shrink-0 gap-1.5">
              <Plus className="size-4" strokeWidth={1.5} />
              New template
            </Button>
          }
          onSave={handleCreate}
        />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <Mail className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-muted-foreground">No templates yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create your first template to speed up donor communications.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{t.name}</span>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <TemplateDialog
                    trigger={
                      <Button variant="ghost" size="icon" className="size-8">
                        <Pencil className="size-3.5" strokeWidth={1.5} />
                      </Button>
                    }
                    initial={t}
                    onSave={(data) => handleUpdate(t.id, data)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(t.id)}
                    disabled={deletingId === t.id}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
