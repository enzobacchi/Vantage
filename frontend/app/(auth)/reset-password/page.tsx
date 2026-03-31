"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkExpired, setLinkExpired] = useState(false)

  // Create client once on mount so it processes the #access_token hash fragment
  const [supabase] = useState(() => createBrowserSupabaseClient())

  useEffect(() => {
    // Check for explicit errors first
    if (searchParams.get("error") === "expired") {
      setLinkExpired(true)
      return
    }
    const hash = window.location.hash
    if (hash.includes("error_code=otp_expired") || hash.includes("error=access_denied")) {
      setLinkExpired(true)
      return
    }

    // @supabase/ssr defaults to PKCE flow and only looks for ?code= in query params.
    // The recovery link uses implicit flow (#access_token=...&type=recovery in hash),
    // so we manually parse the hash and establish the session.
    if (hash) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get("access_token")
      const refreshToken = params.get("refresh_token")
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }
    }
  }, [searchParams, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) {
        // If session is missing/expired, show the expired link UI
        if (updateError.message.toLowerCase().includes("session") ||
            updateError.status === 401) {
          setLinkExpired(true)
          return
        }
        setError(updateError.message)
        return
      }
      router.push("/dashboard")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (linkExpired) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Link expired</h1>
          <p className="text-sm text-balance text-muted-foreground">
            This password reset link has expired or has already been used.
            Please request a new one.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request new reset link</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Back to login
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Enter your new password below
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="password">New Password</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <FieldDescription>
              Must be at least 8 characters long.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">
              Confirm New Password
            </FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
