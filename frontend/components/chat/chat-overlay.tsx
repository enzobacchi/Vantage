"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import type { UIMessage } from "ai"
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Loader2,
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
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"
import { useChatOverlay } from "@/components/chat/chat-provider"
import { ChatDonorCard } from "@/components/chat/chat-donor-card"

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
            return <ToolPart key={i} part={part as { type: string; state?: string; toolCallId?: string; output?: unknown }} />
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

/* ───────── Chat overlay ───────── */

export function ChatOverlay() {
  const { isOpen, close, pendingMessage, clearPendingMessage } = useChatOverlay()
  const [historyLoaded, setHistoryLoaded] = React.useState(false)
  const [input, setInput] = React.useState("")
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [activeDonorId, setActiveDonorId] = React.useState<string | null>(null)

  const handleDonorClick = React.useCallback((id: string) => {
    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      toast.error("Invalid donor link")
      return
    }
    setActiveDonorId((prev) => prev === id ? null : id)
  }, [])

  const closeDonorCard = React.useCallback(() => {
    setActiveDonorId(null)
  }, [])

  const handleNavigateDonor = React.useCallback(() => {
    setActiveDonorId(null)
    close()
  }, [close])

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    error,
  } = useChat()

  React.useEffect(() => {
    if (error) {
      toast.error("Chat error", {
        description: error.message || "Something went wrong. Please try again.",
      })
    }
  }, [error])

  // Load history when overlay opens
  React.useEffect(() => {
    if (!isOpen || historyLoaded) return
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
  }, [isOpen, historyLoaded, setMessages])

  // Auto-send pending message from ChatBar
  React.useEffect(() => {
    if (!isOpen || !pendingMessage) return
    const timer = setTimeout(() => {
      sendMessage({ text: pendingMessage })
      clearPendingMessage()
    }, 50)
    return () => clearTimeout(timer)
  }, [isOpen, pendingMessage, sendMessage, clearPendingMessage])

  // Auto-scroll
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

  // Focus textarea when overlay opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Close on Escape
  React.useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, close])

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

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [input])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-200"
        onClick={close}
      />

      {/* Chat panel */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-2xl border border-border/60 bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 mx-4"
        style={{ maxHeight: "min(80vh, 720px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/vantage-icon.png" alt="Vantage AI" className="size-6" />
            <span className="text-sm font-semibold text-foreground">Vantage AI</span>
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
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={close}
            >
              <X className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        {/* Messages area */}
        {!hasMessages && !isLoading ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
            <h2 className="text-lg font-semibold text-foreground mb-6">
              What can I help with?
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
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
          /* Message list */
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="space-y-6 px-5 py-5">
              {messages.map((message, idx) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onDonorClick={handleDonorClick}
                  activeDonorId={activeDonorId}
                  onCloseDonorCard={closeDonorCard}
                  onNavigateDonor={handleNavigateDonor}
                  isStreaming={status === "streaming" && idx === messages.length - 1 && message.role === "assistant"}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <ShimmerIndicator messages={messages} status={status} />
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 border-t border-border/40 px-4 py-3">
          <div className={cn(
            "relative flex items-end rounded-xl bg-muted/30 transition-colors",
            "border border-border/50 focus-within:border-border focus-within:bg-muted/40"
          )}>
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
          <p className="mt-2 text-center text-[11px] text-muted-foreground/40">
            Vantage AI can search your donor data. Always verify important information.
          </p>
        </div>
      </div>
    </div>
  )
}
