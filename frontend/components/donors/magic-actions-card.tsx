"use client"

import * as React from "react"
import { Copy, Mail, MessageSquare, Phone, Send } from "lucide-react"
import { toast } from "sonner"

import {
  generateEmailDraft,
  generateTextDraft,
  logCall,
  type EmailDraft,
} from "@/app/donors/[id]/actions"
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
  const [textDraftOpen, setTextDraftOpen] = React.useState(false)
  const [emailDraftOpen, setEmailDraftOpen] = React.useState(false)
  const [logCallOpen, setLogCallOpen] = React.useState(false)

  const [textDraft, setTextDraft] = React.useState("")
  const [textLoading, setTextLoading] = React.useState(false)
  const [textError, setTextError] = React.useState<string | null>(null)

  const [emailDraft, setEmailDraft] = React.useState<EmailDraft | null>(null)
  const [emailLoading, setEmailLoading] = React.useState(false)
  const [emailError, setEmailError] = React.useState<string | null>(null)

  const [callNote, setCallNote] = React.useState("")
  const [callSaving, setCallSaving] = React.useState(false)
  const [callError, setCallError] = React.useState<string | null>(null)

  const fetchTextDraft = React.useCallback(async () => {
    setTextLoading(true)
    setTextError(null)
    setTextDraft("")
    try {
      const draft = await generateTextDraft(donorId)
      setTextDraft(draft)
    } catch (e) {
      setTextError(e instanceof Error ? e.message : "Failed to generate draft.")
    } finally {
      setTextLoading(false)
    }
  }, [donorId])

  const fetchEmailDraft = React.useCallback(async () => {
    setEmailLoading(true)
    setEmailError(null)
    setEmailDraft(null)
    try {
      const draft = await generateEmailDraft(donorId)
      setEmailDraft(draft)
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to generate draft.")
    } finally {
      setEmailLoading(false)
    }
  }, [donorId])

  React.useEffect(() => {
    if (textDraftOpen && !textDraft && !textLoading && !textError) {
      fetchTextDraft()
    }
  }, [textDraftOpen, textDraft, textLoading, textError, fetchTextDraft])

  React.useEffect(() => {
    if (emailDraftOpen && !emailDraft && !emailLoading && !emailError) {
      fetchEmailDraft()
    }
  }, [emailDraftOpen, emailDraft, emailLoading, emailError, fetchEmailDraft])

  const handleCopyText = () => {
    if (!textDraft) return
    navigator.clipboard.writeText(textDraft)
    toast.success("Copied to clipboard")
  }

  const handleCopyEmail = () => {
    if (!emailDraft) return
    const full = `Subject: ${emailDraft.subject}\n\n${emailDraft.body}`
    navigator.clipboard.writeText(full)
    toast.success("Copied to clipboard")
  }

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

  const handleCloseText = (open: boolean) => {
    setTextDraftOpen(open)
    if (!open) {
      setTextDraft("")
      setTextError(null)
    }
  }

  const handleCloseEmail = (open: boolean) => {
    setEmailDraftOpen(open)
    if (!open) {
      setEmailDraft(null)
      setEmailError(null)
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
          <CardTitle>Magic Actions</CardTitle>
          <CardDescription>
            Quick actions for outreach and follow-up
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`grid grid-cols-2 gap-3 ${compact ? "[&_button]:h-9" : ""}`}>
            {/* Draft Text (SMS) – hidden until SMS is built
            <Button
              variant="outline"
              className={`justify-start gap-3 border-muted-foreground/30 bg-muted/20 font-medium ${compact ? "h-9" : "h-11"}`}
              onClick={() => setTextDraftOpen(true)}
            >
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              Draft Text
            </Button>
            */}
            <Button
              variant="outline"
              className={`justify-start gap-3 border-muted-foreground/30 bg-muted/20 font-medium ${compact ? "h-9" : "h-11"}`}
              onClick={onSendEmail ?? (() => setEmailDraftOpen(true))}
            >
              {onSendEmail ? (
                <Send className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Mail className="size-4 shrink-0 text-muted-foreground" />
              )}
              {onSendEmail ? "Send Email" : "Draft Email"}
            </Button>
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

      <Dialog open={textDraftOpen} onOpenChange={handleCloseText}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>AI Text Draft</DialogTitle>
            <DialogDescription>
              Draft a text message for {donorName}. Copy and paste into your messaging app.
            </DialogDescription>
          </DialogHeader>
          {textLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-8" />
            </div>
          ) : textError ? (
            <p className="text-sm text-destructive">{textError}</p>
          ) : (
            <Textarea
              readOnly
              value={textDraft}
              className="min-h-[100px] resize-none font-sans"
              placeholder="Generating…"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTextDraftOpen(false)}>
              Close
            </Button>
            {textDraft && (
              <Button onClick={handleCopyText}>
                <Copy className="mr-2 size-4" />
                Copy to Clipboard
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailDraftOpen} onOpenChange={handleCloseEmail}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>AI Email Draft</DialogTitle>
            <DialogDescription>
              Draft an email for {donorName}. Copy and paste into your email client.
            </DialogDescription>
          </DialogHeader>
          {emailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-8" />
            </div>
          ) : emailError ? (
            <p className="text-sm text-destructive">{emailError}</p>
          ) : emailDraft ? (
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium text-muted-foreground">Subject: </span>
                {emailDraft.subject}
              </div>
              <Textarea
                readOnly
                value={emailDraft.body}
                className="min-h-[120px] resize-none font-sans"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDraftOpen(false)}>
              Close
            </Button>
            {emailDraft && (
              <Button onClick={handleCopyEmail}>
                <Copy className="mr-2 size-4" />
                Copy to Clipboard
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
