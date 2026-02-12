"use client"

import * as React from "react"

/** Chat state is memory-only (no sessionStorage/localStorage). Clears on browser refresh (F5). */

export type ChatMessage = { role: "user" | "assistant"; content: string }

export type ChatDonor = {
  id: string
  display_name: string | null
  total_lifetime_value: number | null
  last_donation_date: string | null
}

const DEFAULT_MESSAGES: ChatMessage[] = [
  { role: "assistant", content: "How can I help you?" },
]

type ChatState = {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  sessionId: string
  setSessionId: React.Dispatch<React.SetStateAction<string>>
  lastQuery: string | null
  setLastQuery: React.Dispatch<React.SetStateAction<string | null>>
  lastDonors: ChatDonor[]
  setLastDonors: React.Dispatch<React.SetStateAction<ChatDonor[]>>
  clearNewChat: () => void
}

const ChatContext = React.createContext<ChatState | null>(null)

function nextSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now())
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(DEFAULT_MESSAGES)
  const [sessionId, setSessionId] = React.useState<string>(nextSessionId)
  const [lastQuery, setLastQuery] = React.useState<string | null>(null)
  const [lastDonors, setLastDonors] = React.useState<ChatDonor[]>([])
  // No useEffect that loads from storage; state is memory-only and resets on refresh.

  const clearNewChat = React.useCallback(() => {
    setSessionId(nextSessionId())
    setMessages(DEFAULT_MESSAGES)
    setLastQuery(null)
    setLastDonors([])
  }, [])

  const value = React.useMemo<ChatState>(
    () => ({
      messages,
      setMessages,
      sessionId,
      setSessionId,
      lastQuery,
      setLastQuery,
      lastDonors,
      setLastDonors,
      clearNewChat,
    }),
    [messages, sessionId, lastQuery, lastDonors, clearNewChat]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChatContext(): ChatState {
  const ctx = React.useContext(ChatContext)
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider")
  return ctx
}
