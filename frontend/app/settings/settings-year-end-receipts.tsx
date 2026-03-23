"use client"

import * as React from "react"
import { Eye, FileText, Send } from "lucide-react"
import { toast } from "sonner"
import {
  getYearEndSummaries,
  sendYearEndReceipts,
  type YearEndDonorSummary,
} from "@/app/actions/year-end-receipts"
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
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i)

const DEFAULT_SUBJECT = "Your {{year}} Giving Statement from {{org_name}}"
const DEFAULT_BODY = `Dear {{donor_name}},

Thank you for your generous support in {{year}}. Below is a summary of your giving for tax purposes.

Total Contributions: {{total_giving}}
Number of Gifts: {{donation_count}}
First Gift: {{first_date}}
Last Gift: {{last_date}}

No goods or services were provided in exchange for these contributions.

Please retain this letter for your tax records.

With gratitude,
{{org_name}}`

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function renderTemplate(
  template: string,
  donor: YearEndDonorSummary,
  orgName: string,
  year: string
): string {
  return template
    .replace(/\{\{donor_name\}\}/g, donor.displayName)
    .replace(/\{\{org_name\}\}/g, orgName)
    .replace(/\{\{year\}\}/g, year)
    .replace(/\{\{total_giving\}\}/g, formatCurrency(donor.totalGiving))
    .replace(/\{\{donation_count\}\}/g, String(donor.donationCount))
    .replace(/\{\{first_date\}\}/g, donor.firstDate ? formatShortDate(donor.firstDate) : "N/A")
    .replace(/\{\{last_date\}\}/g, donor.lastDate ? formatShortDate(donor.lastDate) : "N/A")
}

export function SettingsYearEndReceipts() {
  const [year, setYear] = React.useState(String(currentYear - 1))
  const [summaries, setSummaries] = React.useState<YearEndDonorSummary[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [sendOpen, setSendOpen] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [subject, setSubject] = React.useState(DEFAULT_SUBJECT)
  const [body, setBody] = React.useState(DEFAULT_BODY)
  const [orgName, setOrgName] = React.useState("")
  const [previewDonor, setPreviewDonor] = React.useState<YearEndDonorSummary | null>(null)

  const loadSummaries = React.useCallback(async () => {
    setLoading(true)
    setLoaded(false)
    try {
      const data = await getYearEndSummaries(Number(year))
      setSummaries(data)
      // Auto-select donors with email
      setSelected(new Set(data.filter((d) => d.email).map((d) => d.donorId)))
      setLoaded(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load summaries")
    } finally {
      setLoading(false)
    }
  }, [year])

  const donorsWithEmail = summaries.filter((d) => d.email)
  const donorsWithoutEmail = summaries.filter((d) => !d.email)
  const selectedCount = selected.size
  const totalGiving = summaries.reduce((sum, s) => sum + s.totalGiving, 0)

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(donorsWithEmail.map((d) => d.donorId)))
    } else {
      setSelected(new Set())
    }
  }

  const toggleOne = (donorId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(donorId)
      else next.delete(donorId)
      return next
    })
  }

  const handleSend = async () => {
    if (selectedCount === 0) return
    if (!subject.trim()) { toast.error("Subject is required"); return }
    if (!body.trim()) { toast.error("Message body is required"); return }
    if (!orgName.trim()) { toast.error("Organization name is required"); return }

    setSending(true)
    try {
      const result = await sendYearEndReceipts({
        year: Number(year),
        donorIds: [...selected],
        subject,
        bodyTemplate: body,
        orgName: orgName.trim(),
      })
      const parts = [`Sent ${result.sent} receipt${result.sent === 1 ? "" : "s"}`]
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
      if (result.errors.length > 0) parts.push(`${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`)
      toast.success(parts.join(", "))
      setSendOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send receipts")
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 shrink-0" strokeWidth={1.5} />
            Year-End Tax Receipts
          </CardTitle>
          <CardDescription className="mt-1">
            Generate and send annual giving statements to your donors for tax purposes.
            Uses template variables like <code className="rounded bg-muted px-1 text-xs">{"{{donor_name}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{total_giving}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{year}}"}</code>.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={loadSummaries} disabled={loading}>
            {loading ? "Loading..." : "Load Donors"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!loaded && !loading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <FileText className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-muted-foreground">Select a year and click &quot;Load Donors&quot; to see giving summaries.</p>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}

        {loaded && summaries.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <FileText className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-muted-foreground">No donations found for {year}.</p>
          </div>
        )}

        {loaded && summaries.length > 0 && (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Total donors</p>
                <p className="text-lg font-semibold">{summaries.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">With email</p>
                <p className="text-lg font-semibold">{donorsWithEmail.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total giving</p>
                <p className="text-lg font-semibold">{formatCurrency(totalGiving)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="text-lg font-semibold">{selectedCount}</p>
              </div>
              <div className="ml-auto flex items-end">
                <Button
                  size="sm"
                  disabled={selectedCount === 0}
                  onClick={() => setSendOpen(true)}
                  className="gap-1.5"
                >
                  <Send className="size-3.5" strokeWidth={1.5} />
                  Send {selectedCount} Receipt{selectedCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>

            {/* Donor list */}
            <div className="rounded-lg border">
              <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2">
                <Checkbox
                  checked={selectedCount === donorsWithEmail.length && donorsWithEmail.length > 0}
                  onCheckedChange={(checked) => toggleAll(!!checked)}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  Select all with email ({donorsWithEmail.length})
                </span>
              </div>
              <ul className="divide-y max-h-[400px] overflow-y-auto">
                {summaries.map((s) => (
                  <li key={s.donorId} className="flex items-center gap-3 px-4 py-2.5">
                    <Checkbox
                      checked={selected.has(s.donorId)}
                      disabled={!s.email}
                      onCheckedChange={(checked) => toggleOne(s.donorId, !!checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.email ?? "No email"} | {s.donationCount} gift{s.donationCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">
                      {formatCurrency(s.totalGiving)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewDonor(s)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Preview receipt"
                    >
                      <Eye className="size-3.5" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
              {donorsWithoutEmail.length > 0 && (
                <div className="border-t bg-muted/20 px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    {donorsWithoutEmail.length} donor{donorsWithoutEmail.length === 1 ? "" : "s"} without email addresses cannot receive receipts.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Send Dialog */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Send Year-End Receipts</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="yer-org">Organization name (used in template)</Label>
                <Input
                  id="yer-org"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Grace Community Church"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="yer-subject">Email subject</Label>
                <Input
                  id="yer-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="yer-body">Email body</Label>
                <Textarea
                  id="yer-body"
                  className="min-h-[200px] font-mono text-xs"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { token: "{{donor_name}}", label: "Donor name" },
                    { token: "{{org_name}}", label: "Org name" },
                    { token: "{{year}}", label: "Tax year" },
                    { token: "{{total_giving}}", label: "Total giving" },
                    { token: "{{donation_count}}", label: "Gift count" },
                    { token: "{{first_date}}", label: "First gift" },
                    { token: "{{last_date}}", label: "Last gift" },
                  ].map(({ token, label }) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => setBody((b) => b + token)}
                      className="rounded border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title={`Insert ${label}`}
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                This will send {selectedCount} email{selectedCount === 1 ? "" : "s"} to the selected donors.
              </p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="gap-1.5 sm:mr-auto"
                disabled={sending}
                onClick={() => {
                  if (!orgName.trim()) { toast.error("Enter your organization name to preview"); return }
                  const firstSelected = summaries.find((s) => selected.has(s.donorId))
                  if (firstSelected) setPreviewDonor(firstSelected)
                }}
              >
                <Eye className="size-3.5" strokeWidth={1.5} />
                Preview
              </Button>
              <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? "Sending..." : `Send ${selectedCount} Receipt${selectedCount === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!previewDonor} onOpenChange={(open) => { if (!open) setPreviewDonor(null) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Receipt Preview — {previewDonor?.displayName}</DialogTitle>
            </DialogHeader>
            {previewDonor && (
              <div className="space-y-3 pt-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-muted-foreground">To:</span>
                  <span>{previewDonor.email ?? "No email address"}</span>
                </div>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-muted-foreground">Subject:</span>
                  <span>{renderTemplate(subject, previewDonor, orgName || "Your Organization", year)}</span>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: renderTemplate(body, previewDonor, orgName || "Your Organization", year)
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/\n/g, "<br />"),
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This is a preview of how the email will appear. Variables have been replaced with this donor&apos;s data.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewDonor(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
