"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Mail, MapPin, Phone, X } from "lucide-react"
import { toast } from "sonner"

import {
  getDonorProfile,
  getDonorActivityNotes,
  type DonorProfileDonor,
  type DonorProfileDonation,
  type DonorNoteRow,
} from "@/app/donors/[id]/actions"
import { getDonorInteractions } from "@/app/actions/crm"
import type { Interaction } from "@/types/database"
import { DonorInsightsPanel } from "@/components/donors/donor-insights-panel"
import { MagicActionsCard } from "@/components/donors/magic-actions-card"
import { DonorNotesCard } from "@/components/donors/donor-notes-card"
import { DonorTagsCard } from "@/components/donors/donor-tags-card"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/* ───────── Context for global donor popup ───────── */

type DonorPopupContextType = {
  openDonorPopup: (donorId: string) => void
  closeDonorPopup: () => void
}

const DonorPopupContext = React.createContext<DonorPopupContextType | undefined>(undefined)

export function useDonorPopup() {
  const ctx = React.useContext(DonorPopupContext)
  if (ctx === undefined) {
    throw new Error("useDonorPopup must be used within DonorPopupProvider")
  }
  return ctx
}

/* ───────── Provider + Dialog ───────── */

export function DonorPopupProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [donorId, setDonorId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [profile, setProfile] = React.useState<{
    donor: DonorProfileDonor
    donations: DonorProfileDonation[]
  } | null>(null)
  const [activity, setActivity] = React.useState<DonorNoteRow[]>([])

  const openDonorPopup = React.useCallback((id: string) => {
    // Validate UUID format to avoid DB errors from AI-fabricated IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      toast.error("Invalid donor link", {
        description: "This donor reference couldn't be resolved. Try searching in the Donor CRM.",
      })
      return
    }
    setDonorId(id)
  }, [])

  const closeDonorPopup = React.useCallback(() => {
    setDonorId(null)
    setProfile(null)
    setActivity([])
  }, [])

  // Load donor data when popup opens
  React.useEffect(() => {
    if (!donorId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getDonorProfile(donorId),
      getDonorActivityNotes(donorId),
    ])
      .then(([prof, act]) => {
        if (cancelled) return
        if (prof.donor) {
          setProfile({ donor: prof.donor, donations: prof.donations })
          setActivity(act)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[donor-popup] Failed to load donor:", err)
          toast.error("Failed to load donor", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [donorId])

  const isOpen = donorId !== null

  // Compute stats
  const donations = profile?.donations ?? []
  const now = new Date()
  const yearStartStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const toAmount = (d: DonorProfileDonation) => {
    if (d.amount == null) return 0
    const n = typeof d.amount === "number" ? d.amount : Number(d.amount)
    return Number.isFinite(n) ? n : 0
  }
  const lifetimeSum = donations.reduce((sum, d) => sum + toAmount(d), 0)
  const ytdSum = donations
    .filter((d) => d.date != null && d.date >= yearStartStr)
    .reduce((sum, d) => sum + toAmount(d), 0)
  const thisMonthSum = donations
    .filter((d) => d.date != null && d.date >= monthStartStr)
    .reduce((sum, d) => sum + toAmount(d), 0)

  return (
    <DonorPopupContext.Provider value={{ openDonorPopup, closeDonorPopup }}>
      {children}

      <Dialog open={isOpen} onOpenChange={(open) => !open && closeDonorPopup()}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-lg font-bold truncate">
                {profile?.donor?.display_name ?? "Donor"}
              </DialogTitle>
              {donorId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => {
                    closeDonorPopup()
                    router.push(`/dashboard/donors/${donorId}`)
                  }}
                >
                  <ExternalLink className="size-3 mr-1.5" />
                  Full Profile
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          {loading && (
            <div className="flex flex-1 items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          )}

          {!loading && profile?.donor && donorId && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* AI Insights */}
              <DonorInsightsPanel donorId={profile.donor.id} />

              {/* Stats */}
              <div className="grid grid-cols-3 divide-x border rounded-lg">
                <div className="flex flex-col items-center justify-center px-1 py-3">
                  <span className="text-[10px] text-muted-foreground">Lifetime</span>
                  <span className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(lifetimeSum)}</span>
                </div>
                <div className="flex flex-col items-center justify-center px-1 py-3">
                  <span className="text-[10px] text-muted-foreground">YTD</span>
                  <span className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(ytdSum)}</span>
                </div>
                <div className="flex flex-col items-center justify-center px-1 py-3">
                  <span className="text-[10px] text-muted-foreground">This Month</span>
                  <span className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(thisMonthSum)}</span>
                </div>
              </div>

              {/* Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2.5">
                      <Mail className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                      {profile.donor.email ? (
                        <a
                          href={`mailto:${profile.donor.email}`}
                          className="truncate text-sm text-primary hover:underline"
                        >
                          {profile.donor.email}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">--</span>
                      )}
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Phone className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                      <span className="text-sm">{profile.donor.phone ?? "--"}</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <MapPin className="size-4 shrink-0 text-muted-foreground mt-0.5" strokeWidth={1.5} />
                      <span className="text-sm text-muted-foreground">{profile.donor.billing_address ?? "--"}</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Tags */}
              <DonorTagsCard donorId={donorId} />

              {/* Notes */}
              <DonorNotesCard
                donorId={donorId}
                initialNotes={profile.donor.notes}
                savedNotes={activity}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DonorPopupContext.Provider>
  )
}
