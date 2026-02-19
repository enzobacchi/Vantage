"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/dashboard"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailConfirmRequired, setEmailConfirmRequired] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEmailConfirmRequired(false)

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
      const supabase = createBrowserSupabaseClient()
      const baseUrl =
        (typeof window !== "undefined" ? window.location.origin : null) ||
        process.env.NEXT_PUBLIC_APP_URL ||
        ""
      const callbackUrl = baseUrl
        ? `${baseUrl}/auth/callback${next && next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`
        : undefined
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() || undefined },
          emailRedirectTo: callbackUrl,
        },
      })
      if (signUpError) {
        const msg = signUpError.message
        const isEmailError =
          msg.toLowerCase().includes("email") ||
          msg.toLowerCase().includes("confirmation") ||
          msg.toLowerCase().includes("rate limit") ||
          msg.toLowerCase().includes("500")
        setError(
          isEmailError
            ? "We couldn't send the confirmation email. The app admin needs to set up email (SMTP) in Supabase. Try again later or ask them to fix it."
            : msg
        )
        return
      }
      if (data.session) {
        await fetch("/api/auth/link-pending-org", {
          method: "POST",
          credentials: "include",
        })
        router.push(next)
        router.refresh()
        return
      }
      // Supabase may not preserve ?next= when redirecting after email confirmation.
      // Store it in a cookie so the auth callback can redirect back to /join?token=xxx
      if (next && next !== "/dashboard" && typeof document !== "undefined") {
        document.cookie = `auth_next_redirect=${encodeURIComponent(next)}; path=/; max-age=3600; SameSite=Lax`
      }
      setEmailConfirmRequired(true)
    } finally {
      setLoading(false)
    }
  }

  if (emailConfirmRequired) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
              Go to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          {next && next.includes("/join") ? "Create your account to join the team." : "Enter your information below to create your account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Full Name</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
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
              <FieldDescription>
                We&apos;ll use this to contact you. We will not share your email
                with anyone else.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
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
              <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
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
            <FieldGroup>
              <Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account…" : "Create Account"}
                </Button>
                <FieldDescription className="text-center">
                  Already have an account?{" "}
                  <Link
                    href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
                    className="underline hover:text-foreground"
                  >
                    Sign in
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
