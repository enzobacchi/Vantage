"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type TrialSize = "essentials" | "growth" | "pro"

const TRIAL_SIZES: Array<{
  value: TrialSize
  label: string
  donors: string
  description: string
}> = [
  {
    value: "essentials",
    label: "Small",
    donors: "Up to 500 donors",
    description: "Most small ministries and startups",
  },
  {
    value: "growth",
    label: "Medium",
    donors: "500 – 2,500 donors",
    description: "Growing nonprofits",
  },
  {
    value: "pro",
    label: "Large",
    donors: "2,500 – 10,000 donors",
    description: "Established ministries",
  },
]

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/dashboard"
  // Payment Link flow: checkout_session_id is passed from the Stripe success URL
  const checkoutSessionId = searchParams.get("checkout_session_id")
  const isJoinFlow = !!(next && next.includes("/join"))
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [trialSize, setTrialSize] = useState<TrialSize>("essentials")
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
      // Persist the picked trial tier so getOrgSubscription() can read it when
      // it auto-creates the subscription on first dashboard load. Skipped for
      // team-join invites (they inherit the inviter's org + plan).
      if (!isJoinFlow && typeof document !== "undefined") {
        document.cookie = `pending_trial_tier=${trialSize}; path=/; max-age=3600; SameSite=Lax`
      }

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
        // Payment Link flow: link the Stripe checkout session to this new account
        if (checkoutSessionId) {
          await fetch("/api/auth/link-stripe-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ checkout_session_id: checkoutSessionId }),
          })
        }
        router.push(next)
        router.refresh()
        return
      }
      // Supabase may not preserve ?next= when redirecting after email confirmation.
      // Store it in a cookie so the auth callback can redirect back to /join?token=xxx
      if (next && next !== "/dashboard" && typeof document !== "undefined") {
        document.cookie = `auth_next_redirect=${encodeURIComponent(next)}; path=/; max-age=3600; SameSite=Lax`
      }
      // Preserve checkout_session_id through email confirmation flow
      if (checkoutSessionId && typeof document !== "undefined") {
        document.cookie = `stripe_checkout_session_id=${encodeURIComponent(checkoutSessionId)}; path=/; max-age=3600; SameSite=Lax`
      }
      setEmailConfirmRequired(true)
    } finally {
      setLoading(false)
    }
  }

  if (emailConfirmRequired) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-balance text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then sign in.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
            Go to sign in
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className={className} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-sm text-balance text-muted-foreground">
              {next && next.includes("/join")
                ? "Create your account to join the team."
                : "Start your 30-day free trial. No credit card required."}
            </p>
          </div>
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
          {!isJoinFlow && (
            <Field>
              <FieldLabel>About how many donors do you have?</FieldLabel>
              <div className="grid grid-cols-1 gap-2">
                {TRIAL_SIZES.map((size) => {
                  const selected = trialSize === size.value
                  return (
                    <button
                      key={size.value}
                      type="button"
                      onClick={() => setTrialSize(size.value)}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        selected
                          ? "border-foreground bg-accent"
                          : "border-border hover:bg-accent/50"
                      }`}
                      aria-pressed={selected}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{size.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {size.donors}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {size.description}
                      </p>
                    </button>
                  )
                })}
              </div>
              <FieldDescription>
                More than 10,000 donors?{" "}
                <a
                  href="mailto:efbacchiocchi@gmail.com?subject=Vantage%20Enterprise%20inquiry"
                  className="underline hover:text-foreground"
                >
                  Contact us
                </a>{" "}
                — we'll get you set up.
              </FieldDescription>
            </Field>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Field>
            <p className="text-xs text-muted-foreground text-center">
              By creating an account, you agree to our{" "}
              <Link href="/terms" target="_blank" className="underline hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
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
      </form>
    </div>
  )
}
