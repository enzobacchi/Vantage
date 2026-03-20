"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Loader2, Mail, MapPin, Phone, X } from "lucide-react"
import { toast } from "sonner"

import {
  getDonorProfile,
  type DonorProfileDonor,
  type DonorProfileDonation,
} from "@/app/donors/[id]/actions"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"

type ChatDonorCardProps = {
  donorId: string
  onClose: () => void
  onNavigate: () => void
}

export function ChatDonorCard({ donorId, onClose, onNavigate }: ChatDonorCardProps) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [donor, setDonor] = React.useState<DonorProfileDonor | null>(null)
  const [donations, setDonations] = React.useState<DonorProfileDonation[]>([])

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDonorProfile(donorId)
      .then((result) => {
        if (cancelled) return
        if (result.donor) {
          setDonor(result.donor)
          setDonations(result.donations)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error("Failed to load donor")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [donorId])

  const toAmount = (d: DonorProfileDonation) => {
    if (d.amount == null) return 0
    const n = typeof d.amount === "number" ? d.amount : Number(d.amount)
    return Number.isFinite(n) ? n : 0
  }

  const lifetimeSum = donations.reduce((sum, d) => sum + toAmount(d), 0)
  const now = new Date()
  const yearStartStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const ytdSum = donations
    .filter((d) => d.date != null && d.date >= yearStartStr)
    .reduce((sum, d) => sum + toAmount(d), 0)

  const addressParts = [donor?.city, donor?.state].filter(Boolean).join(", ")

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : donor ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border/40 bg-muted/20">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{donor.display_name ?? "Donor"}</p>
              <p className="text-[11px] text-muted-foreground capitalize">
                {donor.donor_type || "individual"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Body */}
          <div className="px-3.5 py-3 space-y-3">
            {/* Stats row */}
            <div className="flex gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lifetime</p>
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(lifetimeSum)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">YTD</p>
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(ytdSum)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gifts</p>
                <p className="text-sm font-semibold tabular-nums">{donations.length}</p>
              </div>
            </div>

            {/* Contact info */}
            <div className="space-y-1.5">
              {donor.email && (
                <div className="flex items-center gap-2">
                  <Mail className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-xs text-muted-foreground truncate">{donor.email}</span>
                </div>
              )}
              {donor.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-xs text-muted-foreground">{donor.phone}</span>
                </div>
              )}
              {addressParts && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-xs text-muted-foreground">{addressParts}</span>
                </div>
              )}
              {!donor.email && !donor.phone && !addressParts && (
                <p className="text-xs text-muted-foreground">No contact info on file</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-3.5 py-2.5 border-t border-border/40 bg-muted/10">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                onNavigate()
                router.push(`/dashboard/donors/${donorId}`)
              }}
            >
              <ExternalLink className="size-3 mr-1.5" />
              View Full Profile
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-6">
          <p className="text-xs text-muted-foreground">Donor not found</p>
        </div>
      )}
    </div>
  )
}
