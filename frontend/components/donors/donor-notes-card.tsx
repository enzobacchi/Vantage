"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, NotebookPen } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { logCall, type DonorNoteRow } from "@/app/donors/[id]/actions"

type DonorNotesCardProps = {
  donorId: string
  initialNotes: string | null
  savedNotes?: DonorNoteRow[]
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function DonorNotesCard({ donorId, initialNotes, savedNotes = [] }: DonorNotesCardProps) {
  const router = useRouter()
  const [draft, setDraft] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [notesOpen, setNotesOpen] = React.useState(false)

  // Show initial donor.notes as a pinned note at the top of saved list if present
  const pinnedNote = initialNotes?.trim() || null

  async function handleSave() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await logCall(donorId, trimmed)
      toast.success("Note saved")
      setDraft("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note")
    } finally {
      setSaving(false)
    }
  }

  const hasNotes = savedNotes.length > 0 || !!pinnedNote

  return (
    <div className="space-y-0">
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Add a note about this donor..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="resize-y min-h-[80px]"
          />
          <Button onClick={handleSave} disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save note"}
          </Button>
        </CardContent>
      </Card>

      {hasNotes && (
        <Card className="rounded-t-none border-t-0">
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-2">
              <NotebookPen className="size-4 text-muted-foreground" strokeWidth={1.5} />
              Saved Notes ({savedNotes.length + (pinnedNote ? 1 : 0)})
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                notesOpen && "rotate-180"
              )}
              strokeWidth={1.5}
            />
          </button>

          {notesOpen && (
            <CardContent className="pt-0 pb-3">
              <ul className="space-y-2">
                {pinnedNote && (
                  <li className="flex flex-col gap-0.5 rounded-md border bg-amber-50/50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40 px-3 py-2 text-sm">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
                      Pinned
                    </span>
                    <p className="whitespace-pre-wrap text-foreground">{pinnedNote}</p>
                  </li>
                )}
                {savedNotes.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-0.5 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </span>
                    <p className="whitespace-pre-wrap text-foreground">{entry.note}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
