"use client"

import { useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

/**
 * Invisible component that detects a checkout_session_id in the URL
 * (from Payment Link → signup → email confirm → dashboard flow)
 * and calls the linking endpoint to connect the Stripe subscription
 * to the user's org. Runs once, then cleans up the URL param.
 */
export function StripeCheckoutLinker() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const linked = useRef(false)
  const sessionId = searchParams.get("checkout_session_id")

  useEffect(() => {
    if (!sessionId || linked.current) return
    linked.current = true

    async function linkCheckout() {
      try {
        const res = await fetch("/api/auth/link-stripe-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ checkout_session_id: sessionId }),
        })
        const data = await res.json()
        if (res.ok && data.linked) {
          toast.success("Your subscription is active — welcome to Vantage!")
        } else if (data.error) {
          console.error("Stripe link error:", data.error)
          toast.error("We couldn't link your subscription. Please contact support.")
        }
      } catch (err) {
        console.error("Stripe link error:", err)
      }

      // Clean up the URL param regardless of outcome
      const url = new URL(window.location.href)
      url.searchParams.delete("checkout_session_id")
      router.replace(url.pathname + url.search, { scroll: false })
    }

    linkCheckout()
  }, [sessionId, router])

  return null
}
