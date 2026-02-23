"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { updateDonorNotes } from "@/app/donors/[id]/actions"

type DonorNotesCardProps = {
  donorId: string
  initialNotes: string | null
  textareaClassName?: string
  /** Called after notes are saved successfully. Use to sync parent state (e.g. CRM table). */
  onNotesSaved?: (donorId: string, notes: string | null) => void
}

export function DonorNotesCard({ donorId, initialNotes, textareaClassName, onNotesSaved }: DonorNotesCardProps) {
  const router = useRouter()
  const [notes, setNotes] = React.useState(initialNotes ?? "")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setNotes(initialNotes ?? "")
  }, [initialNotes])

  async function handleSave() {
    setSaving(true)
    const value = notes.trim() || null
    try {
      await updateDonorNotes(donorId, value)
      toast.success("Notes saved")
      onNotesSaved?.(donorId, value)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save notes")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder="e.g. Prefers contact by email, interested in legacy giving…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={cn("resize-y min-h-[80px]", textareaClassName)}
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save notes"}
        </Button>
      </CardContent>
    </Card>
  )
}
