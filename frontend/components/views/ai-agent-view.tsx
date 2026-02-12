"use client"

import * as React from "react"
import { IconSend, IconSparkles, IconUser } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from "@/components/ui/label"
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNav } from "@/components/nav-context"
import { useChatContext, type ChatMessage, type ChatDonor } from "@/context/chat-context"

export function AIAgentView() {
  const { openDonor, pendingAiQuery, clearPendingAiQuery } = useNav()
  const {
    messages,
    setMessages,
    sessionId,
    lastQuery,
    setLastQuery,
    lastDonors,
    setLastDonors,
    clearNewChat,
  } = useChatContext()
  const [input, setInput] = React.useState("")
  const [isSending, setIsSending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [reportName, setReportName] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)

  const scrollAreaRootRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = React.useCallback(() => {
    const root = scrollAreaRootRef.current
    if (!root) return
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages, isSending])

  const sendMessage = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isSending) return

      setIsSending(true)
      setLastQuery(trimmed)
      setMessages((prev) => [...prev, { role: "user", content: trimmed }])
      void fetch("/api/chat/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: trimmed, session_id: sessionId }),
      }).catch(() => {})

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        })
        const data = (await res.json().catch(() => null)) as any
        if (!res.ok) {
          const msg = data?.error ? String(data.error) : `Request failed (HTTP ${res.status}).`
          throw new Error(msg)
        }
        const reply = typeof data?.reply === "string" ? data.reply : ""
        const donors = Array.isArray(data?.donors) ? (data.donors as any[]) : []
        setLastDonors(
          donors.map((d) => ({
            id: String(d.id),
            display_name: typeof d.display_name === "string" ? d.display_name : null,
            total_lifetime_value:
              typeof d.total_lifetime_value === "number"
                ? d.total_lifetime_value
                : d.total_lifetime_value != null
                  ? Number(d.total_lifetime_value)
                  : null,
            last_donation_date: typeof d.last_donation_date === "string" ? d.last_donation_date : null,
          }))
        )
        setMessages((prev) => [...prev, { role: "assistant", content: reply || "—" }])
        void fetch("/api/chat/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: reply || "—", session_id: sessionId }),
        }).catch(() => {})
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              e instanceof Error
                ? `Error: ${e.message}`
                : "Error: Failed to reach the AI service.",
          },
        ])
      } finally {
        setIsSending(false)
      }
    },
    [isSending, sessionId, messages]
  )

  React.useEffect(() => {
    if (!pendingAiQuery) return
    void sendMessage(pendingAiQuery)
    clearPendingAiQuery()
  }, [pendingAiQuery, clearPendingAiQuery, sendMessage])

  const renderAssistantContent = (content: string) => {
    // Parse [[DONOR_ID|DONOR_NAME]] and markdown links [text](url); render as clickable elements.
    const parts: React.ReactNode[] = []
    const donorRe = /\[\[([0-9a-fA-F-]{36})\|([^\]]+)\]\]/g
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
    type Match = { index: number; length: number; type: "donor"; donorId: string; donorName: string } | { index: number; length: number; type: "link"; text: string; url: string }
    const matches: Match[] = []
    let m: RegExpExecArray | null
    while ((m = donorRe.exec(content)) !== null) {
      matches.push({ index: m.index, length: m[0].length, type: "donor", donorId: m[1], donorName: m[2] })
    }
    while ((m = linkRe.exec(content)) !== null) {
      matches.push({ index: m.index, length: m[0].length, type: "link", text: m[1], url: m[2] })
    }
    matches.sort((a, b) => a.index - b.index)
    let lastIndex = 0
    for (const match of matches) {
      if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index))
      if (match.type === "donor") {
        parts.push(
          <button
            key={`donor-${match.index}`}
            type="button"
            onClick={() => openDonor(match.donorId)}
            className="font-medium underline underline-offset-2"
          >
            {match.donorName}
          </button>
        )
      } else {
        parts.push(
          <a
            key={`link-${match.index}`}
            href={match.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline underline-offset-2 break-all"
          >
            {match.text}
          </a>
        )
      }
      lastIndex = match.index + match.length
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex))
    return <p className="whitespace-pre-wrap break-words">{parts}</p>
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setInput("")
    setTimeout(() => inputRef.current?.focus(), 50)
    try {
      await sendMessage(text)
    } finally {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleNewChat = () => clearNewChat()

  const handleSaveReport = async () => {
    const name = reportName.trim()
    const query = (lastQuery ?? "").trim()
    if (!name || !query) return

    try {
      setIsSaving(true)
      const res = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query }),
      })
      const data = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Save failed (HTTP ${res.status}).`
        throw new Error(msg)
      }
      toast.success("Report saved", { description: name })
      setSaveDialogOpen(false)
      setReportName("")
    } catch (e) {
      toast.error("Failed to save report", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-2">
        <IconSparkles className="size-5 text-slate-900 dark:text-white" />
        <h1 className="text-xl font-semibold">Ask AI</h1>
      </div>
      
      <Card className="flex flex-1 min-h-0 overflow-hidden bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <div className="flex flex-1 flex-col min-h-0">
          <CardHeader className="border-b flex-shrink-0 flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Donor Intelligence Chat</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="bg-transparent" onClick={handleNewChat}>
                New chat
              </Button>
              <Button
                variant="outline"
                className="bg-transparent"
                disabled={!lastQuery || lastDonors.length === 0}
                onClick={() => {
                  setSaveDialogOpen(true)
                  setReportName("")
                }}
              >
                Save as report
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col min-h-0 p-0 overflow-hidden">
              <div ref={scrollAreaRootRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ScrollArea className="h-full min-h-0">
                  <div ref={scrollRef} className="space-y-4 p-4 pb-2">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                          message.role === "assistant"
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-muted"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <IconSparkles className="size-4" />
                        ) : (
                          <IconUser className="size-4" />
                        )}
                      </div>
                      <div
                        className={`max-w-[80%] min-w-0 rounded-lg px-4 py-3 text-sm break-words ${
                          message.role === "assistant"
                            ? "bg-muted [&_a]:text-blue-500 [&_a]:underline [&_a]:underline-offset-2"
                            : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        }`}
                      >
                        {message.role === "assistant"
                          ? renderAssistantContent(String(message.content))
                          : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                      </div>
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                        <IconSparkles className="size-4" />
                      </div>
                      <div className="flex max-w-[80%] items-center rounded-lg bg-muted px-4 py-3 text-sm">
                        <span className="flex gap-1.5">
                          <span
                            className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <span
                            className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </span>
                      </div>
                    </div>
                  )}
                  </div>
                </ScrollArea>
              </div>

              <div className="border-t flex-shrink-0 p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSend()
                  }}
                  className="flex gap-2"
                >
                  <Input
                    ref={inputRef}
                    placeholder="Ask about your donors..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1"
                    disabled={isSending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={isSending}
                    className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    <IconSend className="size-4" />
                    <span className="sr-only">Send message</span>
                  </Button>
                </form>
              </div>
          </CardContent>
        </div>
      </Card>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save report</DialogTitle>
            <DialogDescription>
              Save this query so you can re-run it later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="report-name">Report name</Label>
            <Input
              id="report-name"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="High Value Locals"
            />
            <p className="text-xs text-muted-foreground">
              Query: {lastQuery ?? "—"}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setSaveDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveReport} disabled={isSaving || !reportName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
