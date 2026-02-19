"use client"

import * as React from "react"
import { Mail, Phone, Send } from "lucide-react"
import { toast } from "sonner"

import { logCall } from "@/app/donors/[id]/actions"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"

type MagicActionsCardProps = {
  donorId: string
  donorName: string
  compact?: boolean
  /** When provided, "Send Email" button opens the shared Log Activity dialog (email tab) instead of AI draft. */
  onSendEmail?: () => void
  /** When provided, "Log Call" button opens the shared Log Activity dialog (call tab) instead of inline dialog. */
  onLogCall?: () => void
}

export function MagicActionsCard({ donorId, donorName, compact, onSendEmail, onLogCall }: MagicActionsCardProps) {
  const [logCallOpen, setLogCallOpen] = React.useState(false)
  const [callNote, setCallNote] = React.useState("")
  const [callSaving, setCallSaving] = React.useState(false)
  const [callError, setCallError] = React.useState<string | null>(null)

  const handleSaveCallNote = async () => {
    const trimmed = callNote.trim()
    if (!trimmed) {
      setCallError("Please enter a note.")
      return
    }
    setCallSaving(true)
    setCallError(null)
    try {
      await logCall(donorId, trimmed)
      toast.success("Call logged")
      setCallNote("")
      setLogCallOpen(false)
    } catch (e) {
      setCallError(e instanceof Error ? e.message : "Failed to save note.")
    } finally {
      setCallSaving(false)
    }
  }

  const handleCloseLogCall = (open: boolean) => {
    setLogCallOpen(open)
    if (!open) {
      setCallNote("")
      setCallError(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Outreach and follow-up
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`grid grid-cols-2 gap-3 ${compact ? "[&_button]:h-9" : ""}`}>
            {onSendEmail != null && (
              <Button
                variant="outline"
                className={`justify-start gap-3 border-muted-foreground/30 bg-muted/20 font-medium ${compact ? "h-9" : "h-11"}`}
                onClick={onSendEmail}
              >
                <Send className="size-4 shrink-0 text-muted-foreground" />
                Send Email
              </Button>
            )}
            <Button
              variant="outline"
              className={`justify-start gap-3 border-muted-foreground/30 bg-muted/20 font-medium ${compact ? "h-9" : "h-11"}`}
              onClick={onLogCall ?? (() => setLogCallOpen(true))}
            >
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              Log Call
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={logCallOpen} onOpenChange={handleCloseLogCall}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
            <DialogDescription>
              Record a call with {donorName}. This will appear in the Activity Log on their profile.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={callNote}
            onChange={(e) => setCallNote(e.target.value)}
            placeholder="e.g. Left voicemail. Will follow up next week."
            className="min-h-[100px] resize-none"
            disabled={callSaving}
          />
          {callError && (
            <p className="text-sm text-destructive">{callError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogCallOpen(false)} disabled={callSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveCallNote} disabled={callSaving}>
              {callSaving ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Saving…
                </>
              ) : (
                "Save Note"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
