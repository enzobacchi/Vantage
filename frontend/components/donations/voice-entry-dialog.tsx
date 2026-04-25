"use client"

import * as React from "react"
import {
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { createDonor } from "@/app/actions/donors"
import {
  createDonation,
  createOrgDonationOption,
  type OrgDonationOptionRow,
} from "@/app/actions/donations"
import type { PaymentMethod } from "@/types/database"
import {
  useDonorSearch,
  type DonorSearchItem,
} from "@/lib/hooks/use-donor-search"
import { Button } from "@/components/ui/button"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "venmo", label: "Venmo" },
  { value: "daf", label: "DAF" },
  { value: "other", label: "Other" },
]

const MAX_RECORDING_SECONDS = 120

type ParsedRowResponse = {
  donor: {
    id: string | null
    display_name: string
    candidates: { id: string; display_name: string }[]
    parsed_first_name: string
    parsed_last_name: string
  }
  amount: number
  date: string
  payment_method: PaymentMethod
  category: OptionMatch
  campaign: OptionMatch
  fund: OptionMatch
  memo: string | null
}

type OptionMatch = {
  id: string | null
  name: string | null
  suggested_new: string | null
}

type ParseResponse = {
  transcript: string
  rows: ParsedRowResponse[]
}

type RowState = {
  rowId: string
  skipped: boolean
  donorMode: "search" | "create"
  donorId: string
  donorDisplay: string
  newDonorFirst: string
  newDonorLast: string
  amount: string
  date: string
  paymentMethod: PaymentMethod
  categorySelection: string // option id, "" for none, "__create__" for new
  newCategoryName: string
  campaignSelection: string
  newCampaignName: string
  fundSelection: string
  newFundName: string
  memo: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: OrgDonationOptionRow[]
  campaigns: OrgDonationOptionRow[]
  funds: OrgDonationOptionRow[]
  onOptionsChanged: () => void
  onSavedAny: () => void
}

type Stage = "idle" | "recording" | "parsing" | "review" | "saving"

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function rowFromParsed(row: ParsedRowResponse): RowState {
  const hasMatchedDonor = !!row.donor.id
  const hasNewDonorFields =
    !!row.donor.parsed_first_name || !!row.donor.parsed_last_name
  return {
    rowId: uid(),
    skipped: false,
    donorMode: hasMatchedDonor ? "search" : hasNewDonorFields ? "create" : "search",
    donorId: row.donor.id ?? "",
    donorDisplay: row.donor.display_name ?? "",
    newDonorFirst: row.donor.parsed_first_name ?? "",
    newDonorLast: row.donor.parsed_last_name ?? "",
    amount: row.amount > 0 ? row.amount.toFixed(2) : "",
    date: row.date || todayISO(),
    paymentMethod: row.payment_method,
    categorySelection: row.category.id
      ? row.category.id
      : row.category.suggested_new
        ? "__create__"
        : "",
    newCategoryName: row.category.suggested_new ?? "",
    campaignSelection: row.campaign.id
      ? row.campaign.id
      : row.campaign.suggested_new
        ? "__create__"
        : "",
    newCampaignName: row.campaign.suggested_new ?? "",
    fundSelection: row.fund.id
      ? row.fund.id
      : row.fund.suggested_new
        ? "__create__"
        : "",
    newFundName: row.fund.suggested_new ?? "",
    memo: row.memo ?? "",
  }
}

export function VoiceEntryDialog({
  open,
  onOpenChange,
  categories,
  campaigns,
  funds,
  onOptionsChanged,
  onSavedAny,
}: Props) {
  const [stage, setStage] = React.useState<Stage>("idle")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [transcript, setTranscript] = React.useState("")
  const [rows, setRows] = React.useState<RowState[]>([])
  const [recordingSeconds, setRecordingSeconds] = React.useState(0)
  const [saveProgress, setSaveProgress] = React.useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  })

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const reset = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
    setStage("idle")
    setRows([])
    setTranscript("")
    setRecordingSeconds(0)
    setErrorMessage(null)
    setSaveProgress({ done: 0, total: 0 })
  }, [])

  // Reset state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const sendAudioToParse = React.useCallback(
    async (audioBlob: Blob) => {
      setStage("parsing")
      setErrorMessage(null)
      try {
        const form = new FormData()
        form.append("audio", audioBlob, "recording.webm")
        form.append("clientToday", todayISO())

        const res = await fetch("/api/donations/voice-parse", {
          method: "POST",
          body: form,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const msg =
            (body && typeof body.error === "string" && body.error) ||
            "Parsing failed. Try again."
          setErrorMessage(msg)
          setStage("idle")
          return
        }

        const data = (await res.json()) as ParseResponse
        if (!data.rows.length) {
          setErrorMessage(
            "No donations were detected in that recording. Try saying the donor name and amount more clearly."
          )
          setStage("idle")
          return
        }
        setTranscript(data.transcript)
        setRows(data.rows.map(rowFromParsed))
        setStage("review")
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Couldn't reach the server. Try again."
        )
        setStage("idle")
      }
    },
    []
  )

  const startRecording = React.useCallback(async () => {
    setErrorMessage(null)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone access isn't available in this browser.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        chunksRef.current = []
        if (blob.size === 0) {
          setErrorMessage("Recording was empty. Try again.")
          setStage("idle")
          return
        }
        void sendAudioToParse(blob)
      }

      recorder.start()
      setStage("recording")
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          const next = s + 1
          if (next >= MAX_RECORDING_SECONDS && recorder.state === "recording") {
            recorder.stop()
          }
          return next
        })
      }, 1000)
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Microphone permission denied: ${err.message}`
          : "Microphone permission denied."
      )
      setStage("idle")
    }
  }, [sendAudioToParse])

  const stopRecording = React.useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === "recording") {
      recorder.stop()
    }
  }, [])

  const updateRow = (rowId: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  }

  const validateRow = (row: RowState): string | null => {
    if (row.donorMode === "search") {
      if (!row.donorId) return "Pick a donor"
    } else if (!row.newDonorFirst.trim() && !row.newDonorLast.trim()) {
      return "Donor name is required"
    }
    const amount = parseFloat(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return "Enter a valid date"
    if (row.categorySelection === "__create__" && !row.newCategoryName.trim()) {
      return "Category name is required"
    }
    if (row.campaignSelection === "__create__" && !row.newCampaignName.trim()) {
      return "Campaign name is required"
    }
    if (row.fundSelection === "__create__" && !row.newFundName.trim()) {
      return "Fund name is required"
    }
    return null
  }

  const activeRows = rows.filter((r) => !r.skipped)
  const allValid = activeRows.length > 0 && activeRows.every((r) => validateRow(r) === null)

  const handleSaveAll = async () => {
    if (!allValid) {
      const firstBad = activeRows.find((r) => validateRow(r) !== null)
      if (firstBad) toast.error(validateRow(firstBad) ?? "Fix errors before saving")
      return
    }
    setStage("saving")
    setSaveProgress({ done: 0, total: activeRows.length })

    let optionsChanged = false
    let savedCount = 0
    let failedCount = 0

    for (const row of activeRows) {
      try {
        let donorId = row.donorId
        if (row.donorMode === "create") {
          const first = row.newDonorFirst.trim()
          const last = row.newDonorLast.trim()
          const display = [first, last].filter(Boolean).join(" ")
          const created = await createDonor({
            display_name: display,
            first_name: first || null,
            last_name: last || null,
            donor_type: "individual",
          })
          donorId = created.id
        }

        let categoryId: string | null = null
        if (row.categorySelection === "__create__") {
          const created = await createOrgDonationOption(
            "category",
            row.newCategoryName.trim()
          )
          categoryId = created.id
          optionsChanged = true
        } else if (row.categorySelection) {
          categoryId = row.categorySelection
        }

        let campaignId: string | null = null
        if (row.campaignSelection === "__create__") {
          const created = await createOrgDonationOption(
            "campaign",
            row.newCampaignName.trim()
          )
          campaignId = created.id
          optionsChanged = true
        } else if (row.campaignSelection) {
          campaignId = row.campaignSelection
        }

        let fundId: string | null = null
        if (row.fundSelection === "__create__") {
          const created = await createOrgDonationOption(
            "fund",
            row.newFundName.trim()
          )
          fundId = created.id
          optionsChanged = true
        } else if (row.fundSelection) {
          fundId = row.fundSelection
        }

        await createDonation({
          donor_id: donorId,
          amount: parseFloat(row.amount),
          date: row.date,
          payment_method: row.paymentMethod,
          category_id: categoryId,
          campaign_id: campaignId,
          fund_id: fundId,
          memo: row.memo.trim() || null,
        })
        savedCount++
      } catch (err) {
        failedCount++
        toast.error(
          err instanceof Error
            ? `Skipped a donation: ${err.message}`
            : "Skipped a donation"
        )
      } finally {
        setSaveProgress((p) => ({ done: p.done + 1, total: p.total }))
      }
    }

    if (optionsChanged) onOptionsChanged()
    if (savedCount > 0) onSavedAny()

    if (savedCount > 0 && failedCount === 0) {
      toast.success(
        savedCount === 1 ? "Donation logged" : `${savedCount} donations logged`
      )
      onOpenChange(false)
    } else if (savedCount > 0 && failedCount > 0) {
      toast.success(`Logged ${savedCount}, ${failedCount} failed`)
      setStage("review")
    } else {
      toast.error("None of the donations could be saved")
      setStage("review")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles
              className="size-5 text-[#007A3F]"
              strokeWidth={1.5}
              aria-hidden
            />
            Voice donation entry
          </DialogTitle>
          <DialogDescription>
            Tap record and read off the donations from your envelopes — name, amount,
            payment method, fund. The AI will draft each entry; review and save.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {stage === "idle" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Button
              type="button"
              size="lg"
              onClick={startRecording}
              className="bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 border-0 gap-2"
            >
              <Mic className="size-4" strokeWidth={1.5} />
              Start recording
            </Button>
            <p className="text-xs text-muted-foreground max-w-md text-center">
              Example: &ldquo;Got a fifty dollar check from John Smith on Tuesday for the
              building fund, and a hundred in cash from the Hendersons.&rdquo;
            </p>
          </div>
        )}

        {stage === "recording" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="flex items-center gap-3">
              <span className="relative flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-red-600" />
              </span>
              <span className="text-2xl font-mono tabular-nums">
                {formatTimer(recordingSeconds)}
              </span>
            </div>
            <Button type="button" variant="destructive" onClick={stopRecording} className="gap-2">
              <Square className="size-4" strokeWidth={1.5} />
              Stop &amp; parse
            </Button>
            <p className="text-xs text-muted-foreground">
              Recording stops automatically at {formatTimer(MAX_RECORDING_SECONDS)}.
            </p>
          </div>
        )}

        {stage === "parsing" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Transcribing and parsing donations…
            </p>
          </div>
        )}

        {(stage === "review" || stage === "saving") && (
          <div className="space-y-4">
            {transcript && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">Transcript</p>
                <p className="text-sm mt-1">{transcript}</p>
              </div>
            )}

            <div className="space-y-3">
              {rows.map((row, idx) => (
                <RowCard
                  key={row.rowId}
                  index={idx}
                  row={row}
                  categories={categories}
                  campaigns={campaigns}
                  funds={funds}
                  disabled={stage === "saving"}
                  validationError={validateRow(row)}
                  onUpdate={(patch) => updateRow(row.rowId, patch)}
                  onRemove={() => removeRow(row.rowId)}
                />
              ))}
            </div>

            {stage === "saving" && (
              <div className="text-sm text-muted-foreground text-center">
                Saving {saveProgress.done} of {saveProgress.total}…
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {stage === "review" && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  reset()
                }}
              >
                Discard &amp; re-record
              </Button>
              <Button
                type="button"
                onClick={handleSaveAll}
                disabled={!allValid}
              >
                Save {activeRows.length} {activeRows.length === 1 ? "donation" : "donations"}
              </Button>
            </>
          )}
          {stage === "saving" && (
            <Button type="button" disabled>
              <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
              Saving…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RowCardProps = {
  index: number
  row: RowState
  categories: OrgDonationOptionRow[]
  campaigns: OrgDonationOptionRow[]
  funds: OrgDonationOptionRow[]
  disabled: boolean
  validationError: string | null
  onUpdate: (patch: Partial<RowState>) => void
  onRemove: () => void
}

function RowCard({
  index,
  row,
  categories,
  campaigns,
  funds,
  disabled,
  validationError,
  onUpdate,
  onRemove,
}: RowCardProps) {
  const [donorPopoverOpen, setDonorPopoverOpen] = React.useState(false)
  const { query, setQuery, results, searching } = useDonorSearch()

  const selectExistingDonor = (d: DonorSearchItem) => {
    onUpdate({
      donorId: d.id,
      donorDisplay: d.display_name?.trim() || "Unknown",
    })
    setDonorPopoverOpen(false)
    setQuery("")
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Donation {index + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove this donation"
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Donor *</Label>
        <Tabs
          value={row.donorMode}
          onValueChange={(v) =>
            onUpdate({ donorMode: v as "search" | "create" })
          }
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" disabled={disabled}>
              Existing
            </TabsTrigger>
            <TabsTrigger value="create" disabled={disabled}>
              Create new
            </TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="mt-2 space-y-2">
            <Popover open={donorPopoverOpen} onOpenChange={setDonorPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  disabled={disabled}
                >
                  {row.donorId ? (
                    <span className="truncate">{row.donorDisplay}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {row.donorDisplay || "Search donor by name or email…"}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
              >
                <Input
                  autoFocus
                  placeholder="Type to search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-b-none border-0 border-b"
                />
                <div className="max-h-[200px] overflow-y-auto">
                  {searching && (
                    <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                  )}
                  {!searching && !query.trim() && (
                    <p className="p-3 text-sm text-muted-foreground">
                      Type to find donors.
                    </p>
                  )}
                  {!searching && query.trim() && results.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">No donors found.</p>
                  )}
                  {!searching &&
                    results.map((d) => (
                      <div
                        key={d.id}
                        role="button"
                        tabIndex={0}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none cursor-pointer"
                        onClick={() => selectExistingDonor(d)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            selectExistingDonor(d)
                          }
                        }}
                      >
                        {d.display_name ?? "Unknown"}
                      </div>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
            {row.donorDisplay && !row.donorId && (
              <p className="text-xs text-muted-foreground">
                AI heard &ldquo;{row.donorDisplay}&rdquo; — pick a match or switch to
                Create new.
              </p>
            )}
          </TabsContent>
          <TabsContent value="create" className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`first-${row.rowId}`} className="text-xs">
                  First name *
                </Label>
                <Input
                  id={`first-${row.rowId}`}
                  value={row.newDonorFirst}
                  onChange={(e) => onUpdate({ newDonorFirst: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`last-${row.rowId}`} className="text-xs">
                  Last name
                </Label>
                <Input
                  id={`last-${row.rowId}`}
                  value={row.newDonorLast}
                  onChange={(e) => onUpdate({ newDonorLast: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`amount-${row.rowId}`} className="text-xs">
            Amount ($) *
          </Label>
          <Input
            id={`amount-${row.rowId}`}
            type="number"
            step="0.01"
            min="0.01"
            value={row.amount}
            onChange={(e) => onUpdate({ amount: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`date-${row.rowId}`} className="text-xs">
            Date *
          </Label>
          <Input
            id={`date-${row.rowId}`}
            type="date"
            value={row.date}
            onChange={(e) => onUpdate({ date: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pm-${row.rowId}`} className="text-xs">
            Payment *
          </Label>
          <Select
            value={row.paymentMethod}
            onValueChange={(v) => onUpdate({ paymentMethod: v as PaymentMethod })}
            disabled={disabled}
          >
            <SelectTrigger id={`pm-${row.rowId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((pm) => (
                <SelectItem key={pm.value} value={pm.value}>
                  {pm.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <OptionPicker
          label="Category"
          options={categories}
          selection={row.categorySelection}
          newName={row.newCategoryName}
          onSelectionChange={(v) => onUpdate({ categorySelection: v })}
          onNewNameChange={(v) => onUpdate({ newCategoryName: v })}
          disabled={disabled}
        />
        <OptionPicker
          label="Campaign"
          options={campaigns}
          selection={row.campaignSelection}
          newName={row.newCampaignName}
          onSelectionChange={(v) => onUpdate({ campaignSelection: v })}
          onNewNameChange={(v) => onUpdate({ newCampaignName: v })}
          disabled={disabled}
        />
        <OptionPicker
          label="Fund"
          options={funds}
          selection={row.fundSelection}
          newName={row.newFundName}
          onSelectionChange={(v) => onUpdate({ fundSelection: v })}
          onNewNameChange={(v) => onUpdate({ newFundName: v })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`memo-${row.rowId}`} className="text-xs">
          Memo
        </Label>
        <Textarea
          id={`memo-${row.rowId}`}
          rows={1}
          className="resize-none"
          value={row.memo}
          onChange={(e) => onUpdate({ memo: e.target.value })}
          disabled={disabled}
        />
      </div>

      {validationError && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <X className="size-3" strokeWidth={1.5} />
          {validationError}
        </p>
      )}
    </div>
  )
}

type OptionPickerProps = {
  label: string
  options: OrgDonationOptionRow[]
  selection: string
  newName: string
  onSelectionChange: (value: string) => void
  onNewNameChange: (value: string) => void
  disabled: boolean
}

function OptionPicker({
  label,
  options,
  selection,
  newName,
  onSelectionChange,
  onNewNameChange,
  disabled,
}: OptionPickerProps) {
  const value = selection || "__none__"
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => onSelectionChange(v === "__none__" ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">—</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
          <SelectItem value="__create__">
            <span className="flex items-center gap-1">
              <Plus className="size-3" strokeWidth={1.5} /> Create new…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {selection === "__create__" && (
        <Input
          placeholder={`New ${label.toLowerCase()} name`}
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          disabled={disabled}
          className="mt-1"
        />
      )}
    </div>
  )
}
