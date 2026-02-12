"use client"

import * as React from "react"
import { ThemeProvider } from "next-themes"
import { ChatProvider } from "@/context/chat-context"

/** Wraps the app with ThemeProvider and ChatProvider. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ChatProvider>{children}</ChatProvider>
    </ThemeProvider>
  )
}
