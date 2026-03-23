"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function DonorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[DonorsError]", error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <AlertTriangle className="size-5 text-destructive" strokeWidth={1.5} />
          <CardTitle className="text-base">Could not load donor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred while loading this donor's profile."}
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-muted-foreground/60">
              Error ID: {error.digest}
            </p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
