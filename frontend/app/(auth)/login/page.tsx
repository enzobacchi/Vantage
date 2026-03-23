import { Suspense } from "react"
import { LoginForm } from "@/components/login-form"

export const dynamic = "force-dynamic"

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
      <LoginForm />
    </Suspense>
  )
}
