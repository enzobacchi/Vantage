import { Suspense } from "react"
import { LoginForm } from "@/components/login-form"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
