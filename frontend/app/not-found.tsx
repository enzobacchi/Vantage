import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold tracking-tighter text-foreground">
          404
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-md mx-auto">
          Page not found. The page you are looking for does not exist or has been moved.
        </p>
        <Button
          asChild
          className="mt-8"
          size="lg"
        >
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
