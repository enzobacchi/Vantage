"use client"

import { useEffect, useState } from "react"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

export type AuthUserDisplay = {
  name: string
  email: string
  avatar: string
}

function mapAuthUser(user: User | null): AuthUserDisplay | null {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  const name =
    ((meta.full_name as string) ??
      (meta.name as string) ??
      (user.email ? user.email.split("@")[0] : "")) || "User"
  const avatar = (meta.avatar_url as string) ?? (meta.picture as string) ?? ""
  return {
    name: String(name).trim() || user.email || "User",
    email: user.email ?? "",
    avatar: avatar ? String(avatar) : "",
  }
}

/**
 * Returns the current Supabase auth user mapped to display shape { name, email, avatar }.
 * Updates when auth state changes. Use in client components (e.g. sidebar).
 */
export function useAuthUser(): {
  user: AuthUserDisplay | null
  loading: boolean
} {
  const [user, setUser] = useState<AuthUserDisplay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const supabase = createBrowserSupabaseClient()

    const load = async () => {
      try {
        const {
          data: { user: authUser },
          error,
        } = await supabase.auth.getUser()
        if (mounted) {
          if (error) {
            // Failed to fetch / network: Supabase unreachable, project paused, or CORS
            setUser(null)
          } else {
            setUser(mapAuthUser(authUser ?? null))
          }
        }
      } catch {
        // e.g. TypeError: Failed to fetch — network or Supabase unreachable
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
