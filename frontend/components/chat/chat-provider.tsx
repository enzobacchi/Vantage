"use client"

import * as React from "react"

type ChatOverlayContextType = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  pendingMessage: string | null
  openWithMessage: (msg: string) => void
  clearPendingMessage: () => void
}

const ChatOverlayContext = React.createContext<ChatOverlayContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [pendingMessage, setPendingMessage] = React.useState<string | null>(null)

  const open = React.useCallback(() => setIsOpen(true), [])
  const close = React.useCallback(() => setIsOpen(false), [])
  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), [])
  const openWithMessage = React.useCallback((msg: string) => {
    setPendingMessage(msg)
    setIsOpen(true)
  }, [])
  const clearPendingMessage = React.useCallback(() => setPendingMessage(null), [])

  // Global keyboard shortcut: Cmd+J
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <ChatOverlayContext.Provider value={{ isOpen, open, close, toggle, pendingMessage, openWithMessage, clearPendingMessage }}>
      {children}
    </ChatOverlayContext.Provider>
  )
}

export function useChatOverlay() {
  const ctx = React.useContext(ChatOverlayContext)
  if (ctx === undefined) {
    throw new Error("useChatOverlay must be used within ChatProvider")
  }
  return ctx
}
