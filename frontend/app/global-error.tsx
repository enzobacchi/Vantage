"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalError]", error)
  }, [error])

  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-zinc-950 px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Something went wrong
          </h1>
          <p className="mt-3 text-base text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            An unexpected error occurred. Our team has been notified.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
              Return to Dashboard
            </Button>
          </div>
          {error.digest && (
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">Error ID: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  )
}
