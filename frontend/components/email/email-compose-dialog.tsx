"use client"

import { useEffect, useState, useCallback } from "react"
import { Mail } from "lucide-react"
import { toast } from "sonner"

import { listReceiptTemplates, type ReceiptTemplate } from "@/app/actions/receipt-templates"
import { applyEmailTemplate } from "@/app/settings/settings-email-templates"
import { getEmailRateLimit, type EmailRateLimit } from "@/app/actions/email-rate-limit"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

export type EmailRecipient = {
  donorId: string
  donorEmail: string | null
  donorName: string | null
}

type EmailComposeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent?: () => void
} & (
  | { mode: "single"; recipient: EmailRecipient }
  | { mode: "bulk"; recipients: EmailRecipient[] }
)

const VARIABLE_HINTS = ["{{donor_name}}", "{{org_name}}", "{{date}}"] as const

export function EmailComposeDialog(props: EmailComposeDialogProps) {
  const { open, onOpenChange, onSent } = props

  const [templates, setTemplates] = useState<ReceiptTemplate[]>([])
  const [rateLimit, setRateLimit] = useState<EmailRateLimit | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)

  const isBulk = props.mode === "bulk"
  const recipients = isBulk ? props.recipients : [props.recipient]
  const withEmail = recipients.filter((r) => r.donorEmail)
  const withoutEmail = recipients.length - withEmail.length

  const loadData = useCallback(async () => {
    const [tpl, rl] = await Promise.all([
      listReceiptTemplates(),
      getEmailRateLimit(),
    ])
    setTemplates(tpl)
    setRateLimit(rl)
  }, [])

  useEffect(() => {
    if (open) {
      setSubject("")
      setBody("")
      loadData()
    }
  }, [open, loadData])

  function handleTemplateSelect(templateId: string) {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    const applied = applyEmailTemplate(template, {
      donor_name: isBulk ? "{{donor_name}}" : (props.recipient.donorName ?? ""),
      org_name: "{{org_name}}",
      date: new Date().toLocaleDateString(),
    })
    setSubject(applied.subject)
    setBody(applied.body)
  }

  function insertVariable(variable: string) {
    setBody((prev) => prev + variable)
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message are required.")
      return
    }
    if (withEmail.length === 0) {
      toast.error("No recipients have email addresses.")
      return
    }
    if (rateLimit && withEmail.length > rateLimit.remaining) {
      toast.error(
        `You can only send ${rateLimit.remaining} more email${rateLimit.remaining === 1 ? "" : "s"} this hour (${rateLimit.limit}/hr limit).`
      )
      return
    }

    setSending(true)
    try {
      if (isBulk) {
        const res = await fetch("/api/email/bulk-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients: withEmail.map((r) => ({
              donorId: r.donorId,
              donorEmail: r.donorEmail,
              donorName: r.donorName,
            })),
            subject: subject.trim(),
            message: body.trim(),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "Failed to send emails.")
          return
        }
        const skippedMsg = data.skipped > 0 ? `, ${data.skipped} skipped (no email)` : ""
        const failedMsg = data.failed > 0 ? `, ${data.failed} failed` : ""
        toast.success(`Sent to ${data.sent} donor${data.sent === 1 ? "" : "s"}${skippedMsg}${failedMsg}`)
      } else {
        const recipient = props.recipient
        if (!recipient.donorEmail) {
          toast.error("This donor has no email address.")
          return
        }
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            donorId: recipient.donorId,
            donorEmail: recipient.donorEmail,
            subject: subject.trim(),
            message: body.trim(),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "Failed to send email.")
          return
        }
        toast.success("Email sent successfully.")
      }
      onOpenChange(false)
      onSent?.()
    } catch {
      toast.error("An unexpected error occurred.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4" strokeWidth={1.5} />
            {isBulk ? `Send Email to ${recipients.length} Donor${recipients.length === 1 ? "" : "s"}` : "Send Email"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Recipient info */}
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            {isBulk ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="secondary">{withEmail.length} with email</Badge>
                {withoutEmail > 0 && (
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                    {withoutEmail} without email (will be skipped)
                  </Badge>
                )}
              </div>
            ) : (
              <p className="mt-0.5 text-sm">
                {props.recipient.donorName ?? "Unknown"}{" "}
                {props.recipient.donorEmail ? (
                  <span className="text-muted-foreground">({props.recipient.donorEmail})</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">(no email address)</span>
                )}
              </p>
            )}
          </div>

          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Template</Label>
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subject */}
          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="mt-1"
            />
          </div>

          {/* Body */}
          <div>
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={6}
              className="mt-1"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {VARIABLE_HINTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Rate limit info */}
          {rateLimit && (
            <p className="text-xs text-muted-foreground">
              {rateLimit.remaining} of {rateLimit.limit} emails remaining this hour
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || withEmail.length === 0}>
            {sending
              ? "Sending..."
              : isBulk
                ? `Send to ${withEmail.length} Donor${withEmail.length === 1 ? "" : "s"}`
                : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
