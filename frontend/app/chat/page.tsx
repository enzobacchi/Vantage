"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { ChatBody } from "@/components/chat/chat-overlay"

export default function ChatPage() {
  const router = useRouter()
  const handleClose = React.useCallback(() => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push("/dashboard")
    }
  }, [router])

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatBody active={true} onClose={handleClose} mode="full" />
    </div>
  )
}
