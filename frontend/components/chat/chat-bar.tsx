"use client"

import * as React from "react"
import { ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { useChatOverlay } from "@/components/chat/chat-provider"

export function ChatBar() {
  const { open, isOpen, openWithMessage } = useChatOverlay()
  const [barInput, setBarInput] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (isOpen) return null

  const handleSubmit = () => {
    const text = barInput.trim()
    if (!text) {
      open()
      return
    }
    openWithMessage(text)
    setBarInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
      <div
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm px-4 py-1.5 shadow-sm transition-all",
          "hover:border-border hover:shadow-sm hover:bg-card",
          "focus-within:border-border focus-within:shadow-sm focus-within:bg-card"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <img
          src="/vantage-icon.png"
          alt="Vantage AI"
          className="size-5 shrink-0 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        />
        <input
          ref={inputRef}
          type="text"
          value={barInput}
          onChange={(e) => setBarInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me something..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none py-1.5"
        />
        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground/50">
            <span className="text-xs">⌘</span>J
          </kbd>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleSubmit()
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-lg transition-all",
              barInput.trim()
                ? "bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white shadow-sm hover:opacity-90"
                : "bg-muted/50 text-muted-foreground/50 group-hover:bg-muted group-hover:text-muted-foreground"
            )}
          >
            <ArrowUp className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
