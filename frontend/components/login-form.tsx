"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/dashboard"
  const fromQb = searchParams.get("qb") === "1"
  const qbError = searchParams.get("error")
  const qbNotConfigured = qbError === "qb_not_configured"
  const qbStateError = qbError === "qb_state"
  const qbOtherError = qbError === "qb_error"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message)
        return
      }
      await fetch("/api/auth/link-pending-org", {
        method: "POST",
        credentials: "include",
      })
      router.push(next)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {fromQb && !qbError && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50">
          <AlertDescription>
            QuickBooks connected. Sign in or create an account to access your
            dashboard.
          </AlertDescription>
        </Alert>
      )}
      {qbNotConfigured && (
        <Alert variant="destructive">
          <AlertDescription>
            Sign in with QuickBooks is not configured for this app. Add{" "}
            <strong>QB_CLIENT_ID</strong>, <strong>QB_CLIENT_SECRET</strong>,
            and <strong>QB_ENVIRONMENT</strong> (sandbox or production) in your
            deployment environment variables (e.g. Vercel → Project → Settings →
            Environment Variables).
          </AlertDescription>
        </Alert>
      )}
      {qbStateError && (
        <Alert variant="destructive">
          <AlertDescription>
            QuickBooks connection expired. Please try again — if the issue
            persists, check that your browser allows cookies and disable any
            ad blockers.
          </AlertDescription>
        </Alert>
      )}
      {qbOtherError && (
        <Alert variant="destructive">
          <AlertDescription>
            QuickBooks sign-in failed. Try again or sign in with email.
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Sign in to your Vantage account
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Field>
          <FieldSeparator>Or continue with</FieldSeparator>
          <Field>
            <Button variant="outline" className="w-full" type="button" asChild>
              <a href="/api/quickbooks/auth">Sign in with QuickBooks</a>
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
