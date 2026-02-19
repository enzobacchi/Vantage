"use client"

import * as React from "react"
import { ThemeProvider } from "next-themes"

/** Wraps the app with ThemeProvider. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  )
}
