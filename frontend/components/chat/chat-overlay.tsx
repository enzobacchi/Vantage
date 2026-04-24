"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import type { UIMessage } from "ai"
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  GitCompareArrows,
  LineChart,
  Loader2,
  Maximize2,
  Plus,
  Search,
  UserCircle,
  BarChart3,
  Receipt,
  Activity,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"
import { useChatOverlay } from "@/components/chat/chat-provider"
import { ChatDonorCard } from "@/components/chat/chat-donor-card"
import { BuildCustomReportCard } from "@/components/chat/build-custom-report-card"
import { ChatMetricsCard } from "@/components/chat/chat-metrics-card"
import { ChatTimeseriesChart } from "@/components/chat/chat-timeseries-chart"
import { ChatCompareCard } from "@/components/chat/chat-compare-card"
import { ChatHealthScoreCard } from "@/components/chat/chat-health-score-card"
import { ChatAtRiskCard } from "@/components/chat/chat-at-risk-card"

/* ───────── Markdown-lite renderer ───────── */

function RichText({ text, onDonorClick, isStreaming }: { text: string; onDonorClick: (id: string) => void; isStreaming?: boolean }) {
  const trailingIncomplete = /(?:\[[^\]]*(?:\](?:\([^)]*)?)?|\*\*[^*]*)$/
  const cleanText = isStreaming ? text.replace(trailingIncomplete, "") : text

  const parts: React.ReactNode[] = []
  const regex = /\[([^\]]+)\]\(donor:([^)]+)\)|\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(cleanText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleanText.slice(lastIndex, match.index))
    }
    if (match[1] && match[2]) {
      const donorId = match[2]
      const donorName = match[1]
      parts.push(
        <button
          key={`donor-${match.index}`}
          onClick={() => onDonorClick(donorId)}
          className="font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
        >
          {donorName}
        </button>
      )
    } else if (match[3]) {
      parts.push(<strong key={`bold-${match.index}`} className="font-semibold">{match[3]}</strong>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < cleanText.length) {
    parts.push(cleanText.slice(lastIndex))
  }
  return <>{parts}</>
}

/* ───────── Tool config ───────── */

const TOOL_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  search_donors: { label: "Searched donors", icon: Search },
  get_donor_summary: { label: "Looked up donor profile", icon: UserCircle },
  get_donation_metrics: { label: "Calculated metrics", icon: BarChart3 },
  compare_periods: { label: "Compared periods", icon: GitCompareArrows },
  get_donation_timeseries: { label: "Charted donations", icon: LineChart },
  filter_donations: { label: "Searched donations", icon: Receipt },
  get_recent_activity: { label: "Loaded recent activity", icon: Activity },
  create_donor: { label: "Added donor to CRM", icon: UserCircle },
  create_donation: { label: "Created donation", icon: Receipt },
  get_donor_locations: { label: "Loaded donor locations", icon: Search },
}

const TOOL_CONFIG_LOADING: Record<string, string> = {
  search_donors: "Searching donors",
  get_donor_summary: "Looking up donor profile",
  get_donation_metrics: "Calculating metrics",
  compare_periods: "Comparing periods",
  get_donation_timeseries: "Charting donations",
  filter_donations: "Searching donations",
  get_recent_activity: "Loading recent activity",
  create_donor: "Adding donor to CRM",
  create_donation: "Creating donation",
  get_donor_locations: "Loading donor locations",
}

/* ───────── Tool part ───────── */

function ToolPart({ part }: { part: { type: string; state?: string; toolCallId?: string; output?: unknown } }) {
  const [expanded, setExpanded] = React.useState(false)
  const toolPart = part as { type: string; state: string; toolCallId: string; output?: unknown }
  const toolName = toolPart.type.startsWith("tool-") ? toolPart.type.slice(5) : toolPart.type
  const config = TOOL_CONFIG[toolName]
  const Icon = config?.icon ?? Search
  const isDone = toolPart.state === "output-available" || toolPart.state === "output-error" || toolPart.state === "result"
  const label = isDone ? (config?.label ?? toolName) : (TOOL_CONFIG_LOADING[toolName] ?? toolName)

  return (
    <div className="my-1.5">
      <button
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors",
          isDone && "hover:bg-muted/60 cursor-pointer"
        )}
        onClick={() => isDone && setExpanded((e) => !e)}
      >
        {!isDone ? (
          <Loader2 className="size-3 animate-spin shrink-0 text-teal-500" />
        ) : (
          <Icon className="size-3 shrink-0 text-teal-500" strokeWidth={1.5} />
        )}
        <span>{label}{!isDone && "..."}</span>
        {isDone && (
          expanded
            ? <ChevronDown className="size-2.5 ml-0.5" />
            : <ChevronRight className="size-2.5 ml-0.5" />
        )}
      </button>
      {expanded && isDone && toolPart.output != null && (
        <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg border border-border/40 bg-muted/20 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(toolPart.output as Record<string, unknown>, null, 2)}
        </pre>
      )}
    </div>
  )
}

/* ───────── Copy button ───────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover/msg:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      aria-label="Copy message"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" strokeWidth={1.5} />}
    </button>
  )
}

/* ───────── Message bubble ───────── */

function MessageBubble({
  message,
  onDonorClick,
  activeDonorId,
  onCloseDonorCard,
  onNavigateDonor,
  isStreaming,
}: {
  message: UIMessage
  onDonorClick: (id: string) => void
  activeDonorId: string | null
  onCloseDonorCard: () => void
  onNavigateDonor: () => void
  isStreaming?: boolean
}) {
  const isUser = message.role === "user"
  const textContent = message.parts
    ?.filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("") ?? ""

  // Collect donor IDs mentioned in this message's text parts
  const mentionedDonorIds = React.useMemo(() => {
    const ids = new Set<string>()
    const regex = /\[([^\]]+)\]\(donor:([^)]+)\)/g
    for (const part of message.parts ?? []) {
      if (part.type === "text") {
        const text = (part as { type: "text"; text: string }).text
        let m: RegExpExecArray | null
        while ((m = regex.exec(text)) !== null) {
          ids.add(m[2])
        }
      }
    }
    return ids
  }, [message.parts])

  // Show inline card below this message if it mentions the active donor
  const showCard = activeDonorId && mentionedDonorIds.has(activeDonorId)

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
          <div className="whitespace-pre-wrap break-words">{textContent}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="group/msg flex gap-3 items-start">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full mt-0.5">
        <img src="/vantage-icon.png" alt="Vantage AI" className="size-6" />
      </div>
      <div className="flex-1 min-w-0">
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            const text = (part as { type: "text"; text: string }).text
            return (
              <div key={i} className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                <RichText text={text} onDonorClick={onDonorClick} isStreaming={isStreaming} />
              </div>
            )
          }
          if (part.type.startsWith("tool-")) {
            const tp = part as { type: string; state?: string; toolCallId?: string; output?: unknown }
            if (tp.type === "tool-create_custom_report") {
              return <BuildCustomReportCard key={i} part={tp} />
            }
            if (tp.type === "tool-get_donation_metrics") {
              return <ChatMetricsCard key={i} part={tp} />
            }
            if (tp.type === "tool-get_donation_timeseries") {
              return <ChatTimeseriesChart key={i} part={tp} />
            }
            if (tp.type === "tool-compare_periods") {
              return <ChatCompareCard key={i} part={tp} />
            }
            if (tp.type === "tool-get_donor_health_score") {
              return <ChatHealthScoreCard key={i} part={tp} />
            }
            if (tp.type === "tool-get_at_risk_donors") {
              return <ChatAtRiskCard key={i} part={tp} onDonorClick={onDonorClick} />
            }
            return <ToolPart key={i} part={tp} />
          }
          return null
        })}
        {!message.parts?.some((p) => p.type === "text") && (
          <div className="text-sm text-muted-foreground italic">(Processing...)</div>
        )}
        {showCard && activeDonorId && (
          <ChatDonorCard
            donorId={activeDonorId}
            onClose={onCloseDonorCard}
            onNavigate={onNavigateDonor}
          />
        )}
        <div className="mt-1 flex items-center gap-2 h-5">
          <CopyButton text={textContent} />
        </div>
      </div>
    </div>
  )
}

/* ───────── Shimmer status indicator ───────── */

function getShimmerLabel(messages: UIMessage[], status: string): string {
  const lastMsg = messages[messages.length - 1]
  if (lastMsg?.role === "assistant" && lastMsg.parts) {
    for (let i = lastMsg.parts.length - 1; i >= 0; i--) {
      const part = lastMsg.parts[i]
      if (part.type.startsWith("tool-")) {
        const tp = part as { type: string; state: string }
        const done = ["output-available", "output-error", "result"].includes(tp.state)
        if (!done) {
          const toolName = tp.type.slice(5)
          return (TOOL_CONFIG_LOADING[toolName] ?? "Working") + "..."
        }
      }
    }
  }
  return "Thinking..."
}

function ShimmerIndicator({ messages, status }: { messages: UIMessage[]; status: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full mt-0.5">
        <img src="/vantage-icon.png" alt="Vantage AI" className="size-6" />
      </div>
      <div className="pt-1">
        <TextShimmerWave className="text-sm" duration={1}>
          {getShimmerLabel(messages, status)}
        </TextShimmerWave>
      </div>
    </div>
  )
}

/* ───────── Suggestions ───────── */

const SUGGESTIONS = [
  "Who are my top donors this year?",
  "Show me lapsed donors",
  "What are my donation metrics?",
  "Recent donor activity",
]

/* ───────── Shared chat-session state ───────── */

type ChatMode = "sheet" | "full"

type ChatUsage = { used: number; limit: number; remaining: number; resetsAt: string }

function useChatSession({
  active,
  onClose,
  mode,
}: {
  active: boolean
  onClose: () => void
  mode: ChatMode
}) {
  const { pendingMessage, clearPendingMessage } = useChatOverlay()
  const [historyLoaded, setHistoryLoaded] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [usage, setUsage] = React.useState<ChatUsage | null>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [activeDonorId, setActiveDonorId] = React.useState<string | null>(null)

  const refreshUsage = React.useCallback(async () => {
    try {
      const r = await fetch("/api/chat/usage")
      if (!r.ok) return
      const data: ChatUsage = await r.json()
      setUsage(data)
    } catch {
      // non-fatal — header badge simply won't render
    }
  }, [])

  React.useEffect(() => {
    if (active) void refreshUsage()
  }, [active, refreshUsage])

  const handleDonorClick = React.useCallback((id: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      toast.error("Invalid donor link")
      return
    }
    setActiveDonorId((prev) => (prev === id ? null : id))
  }, [])

  const closeDonorCard = React.useCallback(() => {
    setActiveDonorId(null)
  }, [])

  const handleNavigateDonor = React.useCallback(() => {
    setActiveDonorId(null)
    onClose()
  }, [onClose])

  const { messages, sendMessage, status, setMessages, error } = useChat()

  React.useEffect(() => {
    if (error) {
      toast.error("Chat error", {
        description: error.message || "Something went wrong. Please try again.",
      })
      void refreshUsage()
    }
  }, [error, refreshUsage])

  // Refresh usage after each completed turn.
  const prevStatusRef = React.useRef(status)
  React.useEffect(() => {
    if (prevStatusRef.current === "streaming" && status !== "streaming") {
      void refreshUsage()
    }
    prevStatusRef.current = status
  }, [status, refreshUsage])

  const capHit = usage != null && usage.limit > 0 && usage.used >= usage.limit

  // Load chat history when the surface becomes active.
  React.useEffect(() => {
    if (!active || historyLoaded) return
    fetch("/api/chat/history")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length) {
          setMessages(
            data.messages.map((m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              parts: [{ type: "text" as const, text: m.content }],
            }))
          )
        }
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [active, historyLoaded, setMessages])

  // Auto-send a message queued by ChatBar (sheet mode — ChatBar isn't mounted in full mode).
  React.useEffect(() => {
    if (!active || !pendingMessage) return
    const timer = setTimeout(() => {
      sendMessage({ text: pendingMessage })
      clearPendingMessage()
    }, 50)
    return () => clearTimeout(timer)
  }, [active, pendingMessage, sendMessage, clearPendingMessage])

  // Auto-scroll
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

  // Focus textarea
  React.useEffect(() => {
    if (active) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [active])

  // Escape-to-close only in sheet mode. In full-page mode Escape closing would
  // navigate the user away, which is a worse default than requiring an explicit click.
  React.useEffect(() => {
    if (!active || mode !== "sheet") return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [active, mode, onClose])

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [input])

  const isLoading = status === "submitted" || status === "streaming"
  const hasMessages = messages.length > 0

  const handleNewChat = async () => {
    try {
      await fetch("/api/chat/history", { method: "DELETE" })
      setMessages([])
      setHistoryLoaded(true)
      toast.success("Chat cleared")
    } catch {
      toast.error("Failed to clear chat")
    }
  }

  const onSubmit = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput("")
    sendMessage({ text })
  }

  const handleSuggestion = (prompt: string) => {
    setInput("")
    sendMessage({ text: prompt })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) onSubmit()
    }
  }

  return {
    messages,
    status,
    input,
    setInput,
    isLoading,
    hasMessages,
    activeDonorId,
    handleDonorClick,
    closeDonorCard,
    handleNavigateDonor,
    handleNewChat,
    onSubmit,
    handleSuggestion,
    handleKeyDown,
    bottomRef,
    textareaRef,
    usage,
    capHit,
  }
}

/* ───────── Chat body (shared by sheet + full page) ───────── */

export function ChatBody({
  active,
  onClose,
  onMaximize,
  mode = "sheet",
}: {
  active: boolean
  onClose: () => void
  onMaximize?: () => void
  mode?: ChatMode
}) {
  const {
    messages,
    status,
    input,
    setInput,
    isLoading,
    hasMessages,
    activeDonorId,
    handleDonorClick,
    closeDonorCard,
    handleNavigateDonor,
    handleNewChat,
    onSubmit,
    handleSuggestion,
    handleKeyDown,
    bottomRef,
    textareaRef,
    usage,
    capHit,
  } = useChatSession({ active, onClose, mode })

  const containerClass =
    mode === "full"
      ? "mx-auto w-full max-w-3xl"
      : undefined

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="/vantage-icon.png" alt="Vantage AI" className="size-6" />
          <span className="text-sm font-semibold text-foreground">
            Vantage AI
          </span>
          {usage && usage.limit > 0 && (
            <span
              className={cn(
                "text-[11px] rounded-full border px-2 py-0.5",
                capHit
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border/50 text-muted-foreground"
              )}
              title={`Resets ${new Date(usage.resetsAt).toLocaleDateString()}`}
            >
              {usage.used} / {usage.limit} chats this month
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleNewChat}
            >
              <Plus className="size-3" strokeWidth={1.5} />
              New chat
            </Button>
          )}
          {mode === "sheet" && onMaximize && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onMaximize}
              aria-label="Open in full view"
            >
              <Maximize2 className="size-3.5" strokeWidth={1.5} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label={mode === "sheet" ? "Close chat" : "Back"}
          >
            <X className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      {!hasMessages && !isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            What can I help with?
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-border/60 bg-card px-3.5 py-2 text-xs text-muted-foreground transition-all hover:border-border hover:bg-muted/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className={cn("space-y-6 px-5 py-5", containerClass)}>
            {messages.map((message, idx) => (
              <MessageBubble
                key={message.id}
                message={message}
                onDonorClick={handleDonorClick}
                activeDonorId={activeDonorId}
                onCloseDonorCard={closeDonorCard}
                onNavigateDonor={handleNavigateDonor}
                isStreaming={
                  status === "streaming" &&
                  idx === messages.length - 1 &&
                  message.role === "assistant"
                }
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <ShimmerIndicator messages={messages} status={status} />
              )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border/40 px-4 py-3">
        {capHit ? (
          <div
            className={cn(
              "rounded-xl border border-border/50 bg-muted/30 p-4 text-center text-sm",
              containerClass
            )}
          >
            <p className="font-medium text-foreground">
              You've used all {usage?.limit} AI chats this month.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upgrade your plan for more — or they reset{" "}
              {usage?.resetsAt
                ? new Date(usage.resetsAt).toLocaleDateString()
                : "next month"}
              .
            </p>
            <Button
              asChild
              size="sm"
              className="mt-3 bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 border-0"
            >
              <a href="/settings?tab=billing">Upgrade</a>
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "relative flex items-end rounded-xl bg-muted/30 transition-colors",
              "border border-border/50 focus-within:border-border focus-within:bg-muted/40",
              containerClass
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me something..."
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-h-40"
            />
            <div className="flex items-center gap-1 pr-2 pb-2">
              <button
                disabled={!input.trim() || isLoading}
                onClick={onSubmit}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg transition-all",
                  input.trim() && !isLoading
                    ? "bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white shadow-sm hover:opacity-90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <ArrowUp className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
        <p className="mt-2 text-center text-[11px] text-muted-foreground/40">
          Vantage AI can search your donor data. Always verify important information.
        </p>
      </div>
    </>
  )
}

/* ───────── Chat overlay (sheet wrapper) ───────── */

export function ChatOverlay() {
  const { isOpen, close } = useChatOverlay()
  const router = useRouter()

  const handleMaximize = React.useCallback(() => {
    close()
    router.push("/chat")
  }, [close, router])

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) close() }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="!max-w-none w-full bg-card sm:w-[520px] lg:w-[600px] p-0 gap-0 flex flex-col border-l border-border/60"
      >
        <SheetTitle className="sr-only">Vantage AI chat</SheetTitle>
        <ChatBody
          active={isOpen}
          onClose={close}
          onMaximize={handleMaximize}
          mode="sheet"
        />
      </SheetContent>
    </Sheet>
  )
}
