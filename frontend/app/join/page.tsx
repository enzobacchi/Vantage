"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { acceptInvitation, getInvitationPreview } from "@/app/actions/team"
import { useAuthUser } from "@/hooks/use-auth-user"
import { Button } from "@/components/ui/button"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"

function JoinPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token") ?? ""
  const { user, loading: authLoading } = useAuthUser()
  const [orgName, setOrgName] = React.useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = React.useState<string | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [joining, setJoining] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)

  React.useEffect(() => {
    if (!token.trim()) {
      setPreviewError("Missing invite token.")
      return
    }
    getInvitationPreview(token).then((r) => {
      if (r.error) setPreviewError(r.error)
      else {
        setOrgName(r.orgName ?? "this organization")
        setInviteEmail(r.email ?? null)
      }
    })
  }, [token])

  const loginUrl = React.useMemo(() => {
    if (!token) return "/login"
    const next = `/join?token=${encodeURIComponent(token)}`
    return `/login?next=${encodeURIComponent(next)}`
  }, [token])

  React.useEffect(() => {
    if (authLoading) return
    if (!user && token) {
      window.location.href = loginUrl
    }
  }, [authLoading, user, token, loginUrl])

  const handleJoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      const result = await acceptInvitation(token)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`You joined ${result.orgName ?? "the team"}.`)
      router.push("/dashboard")
      router.refresh()
    } finally {
      setJoining(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">Invalid invite</h1>
          <p className="text-sm text-muted-foreground">
            This invite link is missing a token. Ask your admin for a new link.
          </p>
          <Button variant="outline" onClick={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    )
  }

  if (previewError) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">Invalid or expired invite</h1>
          <p className="text-sm text-muted-foreground">{previewError}</p>
          <Button variant="outline" onClick={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    )
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">Sign in to join</h1>
          <p className="text-sm text-muted-foreground">
            You need to sign in or create an account to join <strong>{orgName ?? "this team"}</strong>.
          </p>
          <Button asChild className="w-full">
            <a href={loginUrl}>Sign in or create account</a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Redirecting automatically…
          </p>
        </div>
      </div>
    )
  }

  const invitedEmailLower = (inviteEmail ?? "").trim().toLowerCase()
  const currentEmailLower = (user.email ?? "").trim().toLowerCase()
  const wrongAccount = invitedEmailLower && currentEmailLower !== invitedEmailLower

  if (wrongAccount) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">Wrong account</h1>
          <p className="text-sm text-muted-foreground">
            This invite was sent to <strong>{inviteEmail}</strong>. You're signed in as{" "}
            <strong>{user.email}</strong>. Sign out and open this link again to sign in or create an
            account with the invited email.
          </p>
          <Button
            className="w-full"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true)
              const supabase = createBrowserSupabaseClient()
              await supabase.auth.signOut()
              router.push(`/join?token=${encodeURIComponent(token)}`)
              router.refresh()
            }}
          >
            {signingOut ? "Signing out…" : "Sign out and use invite email"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-xl font-semibold">You’re invited</h1>
        <p className="text-sm text-muted-foreground">
          You have been invited to join <strong>{orgName ?? "this organization"}</strong>.
        </p>
        <Button className="w-full" onClick={handleJoin} disabled={joining}>
          {joining ? "Joining…" : "Join team"}
        </Button>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  )
}
