"use client"

import * as React from "react"
import type { UIMessage } from "ai"
import { ChevronDown, ChevronRight, Loader2, User } from "lucide-react"

import { cn } from "@/lib/utils"

function VantageLogo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "size-10" : "size-7"
  const imgDim = size === "lg" ? "size-7" : "size-5"
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full", dim)}>
      <img
        src="/vantage-icon.png"
        alt="Vantage AI"
        className={imgDim}
      />
    </div>
  )
}

type ChatMessagesProps = {
  messages: UIMessage[]
  isLoading: boolean
}

const TOOL_LABELS: Record<string, string> = {
  search_donors: "Searching donors",
  get_donor_summary: "Looking up donor profile",
  get_donation_metrics: "Calculating donation metrics",
  filter_donations: "Searching donations",
  get_recent_activity: "Loading recent activity",
}

function ToolPart({ part }: { part: { type: string; state?: string; toolCallId?: string; output?: unknown } }) {
  const [expanded, setExpanded] = React.useState(false)

  // In AI SDK v6, tool parts have type like "tool-search_donors"
  // and properties: state, toolCallId, output, etc.
  const toolPart = part as {
    type: string
    state: string
    toolCallId: string
    output?: unknown
  }

  // Extract tool name from type (e.g., "tool-search_donors" -> "search_donors")
  const toolName = toolPart.type.startsWith("tool-")
    ? toolPart.type.slice(5)
    : toolPart.type

  const label = TOOL_LABELS[toolName] ?? toolName
  const isDone = toolPart.state === "result" || toolPart.state === "output"

  return (
    <div className="my-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
      <button
        onClick={() => isDone && setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-2 w-full text-left text-muted-foreground",
          isDone && "cursor-pointer hover:text-foreground"
        )}
      >
        {!isDone ? (
          <Loader2 className="size-3 animate-spin shrink-0" />
        ) : expanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span>
          {label}
          {isDone ? "" : "..."}
        </span>
      </button>
      {expanded && isDone && toolPart.output != null && (
        <pre className="mt-2 max-h-32 overflow-auto text-[10px] text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(
            toolPart.output as Record<string, unknown>,
            null,
            2
          )}
        </pre>
      )}
    </div>
  )
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <VantageLogo size="lg" />
        <h3 className="text-lg font-semibold text-foreground">Vantage AI</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ask me anything about your donors, donations, and fundraising
          activity. I can search records, calculate metrics, and surface
          insights.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex gap-3 text-sm",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {message.role === "assistant" && (
            <VantageLogo />
          )}
          <div
            className={cn(
              "max-w-[80%] rounded-lg px-3 py-2",
              message.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {message.parts?.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div key={i} className="whitespace-pre-wrap break-words">
                    {part.text}
                  </div>
                )
              }
              // Tool parts have types like "tool-search_donors"
              if (part.type.startsWith("tool-")) {
                return <ToolPart key={i} part={part as { type: string; state?: string; toolCallId?: string; output?: unknown }} />
              }
              return null
            })}
            {/* Fallback for messages without text parts */}
            {!message.parts?.some((p) => p.type === "text") && (
              <div className="whitespace-pre-wrap break-words text-muted-foreground italic">
                (No text content)
              </div>
            )}
          </div>
          {message.role === "user" && (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
              <User className="size-4 text-foreground" strokeWidth={1.5} />
            </div>
          )}
        </div>
      ))}
      {isLoading &&
        messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <VantageLogo />
            <div className="rounded-lg bg-muted px-3 py-2">
              <div className="flex gap-1">
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      <div ref={bottomRef} />
    </div>
  )
}
