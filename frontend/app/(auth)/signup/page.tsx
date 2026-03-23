import { Suspense } from "react"
import { SignupForm } from "@/components/signup-form"

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
      <SignupForm />
    </Suspense>
  )
}
