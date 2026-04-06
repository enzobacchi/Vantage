"use client"

import * as React from "react"

import { ChartBarDonations } from "@/components/chart-bar-donations"
import { RecentGifts } from "@/components/recent-gifts"
import { TopDonorsWidget } from "@/components/top-donors-widget"
import { SectionCards } from "@/components/section-cards"
import { DailyInsights } from "@/components/daily-insights"
import { OnboardingChecklist } from "@/components/onboarding-checklist"
import { DashboardCustomize } from "@/components/dashboard-customize"
import type { DashboardPreferences } from "@/app/actions/dashboard-preferences"

const DEFAULT_PREFS: DashboardPreferences = {
  show_metric_cards: true,
  show_smart_actions: true,
  show_donations_chart: true,
  show_recent_gifts: true,
  show_top_donors: true,
}

export function DashboardView() {
  const [prefs, setPrefs] = React.useState<DashboardPreferences>(DEFAULT_PREFS)

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Setup checklist (auto-hides when complete or dismissed) */}
        <section className="px-4 lg:px-6">
          <OnboardingChecklist />
        </section>

        {/* Dashboard header with customize button */}
        <div className="flex items-center justify-between px-4 lg:px-6">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <DashboardCustomize onPrefsChange={setPrefs} />
        </div>

        {/* Row 1: Metric cards */}
        {prefs.show_metric_cards && (
          <section className="px-4 lg:px-6">
            <SectionCards />
          </section>
        )}

        {/* Row 2: Daily Insights (left) + Giving chart (right) */}
        {prefs.show_smart_actions && prefs.show_donations_chart && (
          <section className="grid gap-4 px-4 lg:grid-cols-3 lg:px-6">
            <DailyInsights />
            <div className="lg:col-span-2">
              <ChartBarDonations />
            </div>
          </section>
        )}
        {prefs.show_smart_actions && !prefs.show_donations_chart && (
          <section className="px-4 lg:px-6">
            <DailyInsights />
          </section>
        )}
        {!prefs.show_smart_actions && prefs.show_donations_chart && (
          <section className="px-4 lg:px-6">
            <ChartBarDonations />
          </section>
        )}

        {/* Row 3: Recent Gifts + Top Donors */}
        {prefs.show_recent_gifts && prefs.show_top_donors && (
          <section className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <RecentGifts />
            <TopDonorsWidget />
          </section>
        )}
        {prefs.show_recent_gifts && !prefs.show_top_donors && (
          <section className="px-4 lg:px-6">
            <RecentGifts />
          </section>
        )}
        {!prefs.show_recent_gifts && prefs.show_top_donors && (
          <section className="px-4 lg:px-6">
            <TopDonorsWidget />
          </section>
        )}
      </div>
    </div>
  )
}
