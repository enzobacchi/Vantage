"use client"

import * as React from "react"
import { toast } from "sonner"
import { Mic, RotateCcw } from "lucide-react"

import {
  getOrgDonationOptions,
  type OrgDonationOptionRow,
} from "@/app/actions/donations"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  VoicePreviewTable,
  parsedToDraft,
  rowValidationError,
  type DraftRow,
} from "@/components/donations/voice-preview-table"
import { VoiceRecorder } from "@/components/donations/voice-recorder"
import type {
  VoiceCommitResponse,
  VoiceCommitRow,
  VoiceParseResponse,
} from "@/lib/donations/voice-schema"

function draftToCommitRow(r: DraftRow): VoiceCommitRow {
  return {
    donor_id: r.donorMode === "existing" ? r.donorId : null,
    create_new:
      r.donorMode === "create"
        ? {
            display_name: r.newDonorName.trim(),
            email: r.newDonorEmail.trim() || null,
            donor_type: r.newDonorType,
          }
        : null,
    amount: parseFloat(r.amount),
    date: r.date,
    payment_method: r.paymentMethod,
    category_id: r.categoryId || null,
    campaign_id: r.campaignId || null,
    fund_id: r.fundId || null,
    memo: r.memo.trim() || null,
  }
}

export function VoiceEntryPanel() {
  const [rows, setRows] = React.useState<DraftRow[]>([])
  const [transcript, setTranscript] = React.useState<string>("")
  const [saving, setSaving] = React.useState(false)
  const [recorderError, setRecorderError] = React.useState<string | null>(null)
  const [categories, setCategories] = React.useState<OrgDonationOptionRow[]>([])
  const [campaigns, setCampaigns] = React.useState<OrgDonationOptionRow[]>([])
  const [funds, setFunds] = React.useState<OrgDonationOptionRow[]>([])

  React.useEffect(() => {
    getOrgDonationOptions()
      .then((opts) => {
        setCategories(opts.filter((o) => o.type === "category"))
        setCampaigns(opts.filter((o) => o.type === "campaign"))
        setFunds(opts.filter((o) => o.type === "fund"))
      })
      .catch(() => {})
  }, [])

  const handleParsed = React.useCallback((result: VoiceParseResponse) => {
    setRecorderError(null)
    setTranscript(result.transcript)
    if (result.donations.length === 0) {
      toast.message("No donations detected in that recording.")
      return
    }
    const drafts = result.donations.map(parsedToDraft)
    setRows((prev) => [...prev, ...drafts])
    toast.success(
      `Found ${drafts.length} donation${drafts.length === 1 ? "" : "s"} — review and save.`
    )
  }, [])

  const handleRecorderError = React.useCallback((msg: string) => {
    setRecorderError(msg)
    toast.error(msg)
  }, [])

  const handleClear = () => {
    setRows([])
    setTranscript("")
    setRecorderError(null)
  }

  const errors = rows
    .map((r, i) => ({ i, err: rowValidationError(r) }))
    .filter((x): x is { i: number; err: string } => x.err !== null)
  const hasRows = rows.length > 0
  const canSave = hasRows && errors.length === 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = { rows: rows.map(draftToCommitRow) }
      const res = await fetch("/api/donations/voice-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as
        | VoiceCommitResponse
        | { error?: string }
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? "Save failed")
      }
      const out = json as VoiceCommitResponse
      if (out.errors.length === 0) {
        toast.success(
          `Logged ${out.created} donation${out.created === 1 ? "" : "s"}`
        )
        handleClear()
      } else if (out.created > 0) {
        toast.warning(
          `Logged ${out.created} of ${rows.length}. ${out.errors.length} failed: ${out.errors[0].message}${out.errors.length > 1 ? "…" : ""}`,
          { duration: 10_000 }
        )
        // Keep only the failed rows so the user can retry/fix them.
        const failedIndices = new Set(out.errors.map((e) => e.index))
        setRows((prev) => prev.filter((_, i) => failedIndices.has(i)))
      } else {
        toast.error(
          `No donations were saved. First error: ${out.errors[0]?.message ?? "unknown"}`
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="size-5" strokeWidth={1.5} />
          Dictate donations
        </CardTitle>
        <CardDescription>
          Tap the mic and speak naturally. Try: &ldquo;Sarah Smith gave $200 in cash for the
          building fund today, John Doe wrote a check for $50 yesterday.&rdquo; Review the table,
          edit anything that&rsquo;s off, then save them all at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <VoiceRecorder
            onParsed={handleParsed}
            onError={handleRecorderError}
            disabled={saving}
          />
          {hasRows && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={saving}
              className="gap-2 text-muted-foreground"
            >
              <RotateCcw className="size-4" strokeWidth={1.5} />
              Clear all
            </Button>
          )}
        </div>

        {recorderError && (
          <Alert variant="destructive">
            <AlertDescription>{recorderError}</AlertDescription>
          </Alert>
        )}

        {transcript && (
          <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              Transcript
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-foreground">{transcript}</p>
          </details>
        )}

        <VoicePreviewTable
          rows={rows}
          onChange={setRows}
          categories={categories}
          campaigns={campaigns}
          funds={funds}
        />

        {hasRows && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {errors.length === 0
                ? `${rows.length} ready to log.`
                : `${errors.length} row${errors.length === 1 ? "" : "s"} need attention.`}
            </p>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : `Save all (${rows.length})`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
