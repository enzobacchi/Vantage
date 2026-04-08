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
  Sparkles,
  BarChart3,
  Search,
  UserCircle,
  Receipt,
  Activity,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"
import { useDonorPopup } from "@/components/donors/donor-popup"

/* ───────── Markdown-lite renderer ───────── */

/**
 * Renders text with:
 * - [Name](donor:id) → clickable donor link
 * - **bold** → <strong>
 * - Strips stray asterisks
 */
function RichText({ text, onDonorClick }: { text: string; onDonorClick: (id: string) => void }) {
  // Strip any trailing incomplete link/bold pattern that's still streaming in.
  // Matches partial: "[text", "[text]", "[text](", "[text](donor:", "[text](donor:abc..."
  // Also partial bold: "**text" without closing "**"
  const trailingIncomplete = /(?:\[[^\]]*(?:\](?:\([^)]*)?)?|\*\*[^*]*)$/
  const cleanText = text.replace(trailingIncomplete, "")

  const parts: React.ReactNode[] = []
  const regex = /\[([^\]]+)\]\(donor:([^)]+)\)|\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(cleanText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleanText.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      const donorName = match[1]
      const donorId = match[2]
      const key = `donor-${match.index}`
      parts.push(
        <button
          key={key}
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

/* ───────── Tool labels & icons ───────── */

const TOOL_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  search_donors: { label: "Searched donors", icon: Search },
  get_donor_summary: { label: "Looked up donor profile", icon: UserCircle },
  get_donation_metrics: { label: "Calculated metrics", icon: BarChart3 },
  filter_donations: { label: "Searched donations", icon: Receipt },
  get_recent_activity: { label: "Loaded recent activity", icon: Activity },
  create_donation: { label: "Created donation", icon: Receipt },
  get_donor_locations: { label: "Loaded donor locations", icon: Search },
}

const TOOL_CONFIG_LOADING: Record<string, string> = {
  search_donors: "Searching donors",
  get_donor_summary: "Looking up donor profile",
  get_donation_metrics: "Calculating metrics",
  filter_donations: "Searching donations",
  get_recent_activity: "Loading recent activity",
  create_donation: "Creating donation",
  get_donor_locations: "Loading donor locations",
}

/* ───────── Tool invocation display ───────── */

function ToolPart({ part }: { part: { type: string; state?: string; toolCallId?: string; output?: unknown } }) {
  const [expanded, setExpanded] = React.useState(false)
  const toolPart = part as { type: string; state: string; toolCallId: string; output?: unknown }
  const toolName = toolPart.type.startsWith("tool-") ? toolPart.type.slice(5) : toolPart.type
  const config = TOOL_CONFIG[toolName]
  const Icon = config?.icon ?? Search
  const isDone = toolPart.state === "output-available" || toolPart.state === "output-error" || toolPart.state === "result"
  const label = isDone
    ? (config?.label ?? toolName)
    : (TOOL_CONFIG_LOADING[toolName] ?? toolName)

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

/* ───────── Message rendering ───────── */

function MessageBubble({ message, onDonorClick }: { message: UIMessage; onDonorClick: (id: string) => void }) {
  const isUser = message.role === "user"
  const textContent = message.parts
    ?.filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("") ?? ""

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
                <RichText text={text} onDonorClick={onDonorClick} />
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

/* ───────── Suggested prompts ───────── */

const SUGGESTIONS = [
  "Who are my top donors this year?",
  "Show me lapsed donors",
  "What are my donation metrics?",
  "Recent donor activity",
]

/* ───────── Empty state (ChatGPT-style) ───────── */

function EmptyState({
  onSuggestionClick,
  inputArea,
}: {
  onSuggestionClick: (prompt: string) => void
  inputArea: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        {/* Title */}
        <h1 className="text-2xl font-semibold text-foreground">
          What can I help with?
        </h1>

        {/* Input */}
        {inputArea}

        {/* Suggestions */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestionClick(s)}
              className="rounded-full border border-border/60 bg-card px-3.5 py-2 text-xs text-muted-foreground transition-all hover:border-border hover:bg-muted/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───────── Chat input ───────── */

function ChatInputBox({
  value,
  onChange,
  onSubmit,
  isLoading,
  animatedBorder,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  animatedBorder?: boolean
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [value])

  React.useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isLoading) onSubmit()
    }
  }

  const inputContent = (
    <div className={cn(
      "relative flex items-end rounded-2xl bg-card shadow-sm transition-colors",
      !animatedBorder && "border border-border/60 focus-within:border-border focus-within:shadow-sm"
    )}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Vantage AI..."
        disabled={isLoading}
        rows={1}
        className="flex-1 resize-none bg-transparent px-4 py-3.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-h-40"
      />
      <div className="flex items-center gap-1 pr-2 pb-2">
        <button
          disabled={!value.trim() || isLoading}
          onClick={onSubmit}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-all",
            value.trim() && !isLoading
              ? "bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white shadow-sm hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <ArrowUp className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-2xl mx-auto">
      {animatedBorder ? (
        <div className="animated-gradient-border">
          {inputContent}
        </div>
      ) : (
        inputContent
      )}
    </div>
  )
}

/* ───────── Main ChatView ───────── */

export function ChatView() {
  const [historyLoaded, setHistoryLoaded] = React.useState(false)
  const [input, setInput] = React.useState("")
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const { openDonorPopup } = useDonorPopup()

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

  // Load history on mount
  React.useEffect(() => {
    if (historyLoaded) return
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
  }, [historyLoaded, setMessages])

  // Auto-scroll
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

  const isLoading = status === "submitted" || status === "streaming"

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

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Minimal header — only shows New Chat when in conversation */}
      {hasMessages && (
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
          <div className="flex items-center gap-2">
            <img src="/vantage-icon.png" alt="Vantage AI" className="size-5" />
            <span className="text-sm font-medium text-foreground">Vantage AI</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleNewChat}
          >
            <Plus className="size-3" strokeWidth={1.5} />
            New chat
          </Button>
        </div>
      )}

      {/* Content */}
      {!hasMessages && !isLoading ? (
        <EmptyState
          onSuggestionClick={handleSuggestion}
          inputArea={
            <div className="w-full px-4">
              <ChatInputBox
                value={input}
                onChange={setInput}
                onSubmit={onSubmit}
                isLoading={isLoading}
                animatedBorder
              />
            </div>
          }
        />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onDonorClick={openDonorPopup}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <ShimmerIndicator messages={messages} status={status} />
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Bottom input when in conversation */}
          <div className="px-4 pb-4 pt-2">
            <ChatInputBox
              value={input}
              onChange={setInput}
              onSubmit={onSubmit}
              isLoading={isLoading}
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
              Vantage AI can search your donor data. Always verify important information.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
