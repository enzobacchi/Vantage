"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { acceptTerms } from "@/app/actions/legal"
import { toast } from "sonner"

export function TosAcceptanceDialog({ open }: { open: boolean }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    if (!checked) return
    setLoading(true)
    try {
      const result = await acceptTerms()
      if (result.success) {
        toast.success("Terms accepted")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to accept terms")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Terms of Service & Privacy Policy</DialogTitle>
          <DialogDescription>
            Before using Vantage, please review and accept our Terms of Service
            and Privacy Policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Please review the following documents:
          </p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <Link
                href="/terms"
                target="_blank"
                className="text-foreground underline hover:opacity-80"
              >
                Terms of Service
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                target="_blank"
                className="text-foreground underline hover:opacity-80"
              >
                Privacy Policy
              </Link>
            </li>
          </ul>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-3">
          <Checkbox
            id="tos-agree"
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
          />
          <label
            htmlFor="tos-agree"
            className="text-sm leading-snug text-foreground cursor-pointer"
          >
            I have read and agree to the Terms of Service and Privacy Policy.
          </label>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full"
          >
            {loading ? "Accepting..." : "Accept & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
