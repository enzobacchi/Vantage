"use client"

import { ChartBarDonations } from "@/components/chart-bar-donations"
import { RecentGifts } from "@/components/recent-gifts"
import { TopDonorsWidget } from "@/components/top-donors-widget"
import { SectionCards } from "@/components/section-cards"

export function DashboardView() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Row 1: Three metric cards */}
        <section className="px-4 lg:px-6">
          <SectionCards />
        </section>

        {/* Row 2: Giving chart */}
        <section className="px-4 lg:px-6">
          <ChartBarDonations />
        </section>

        {/* Row 3: Two-column split - Recent Gifts (left) + Top Donors (right) */}
        <section className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
          <RecentGifts />
          <TopDonorsWidget />
        </section>
      </div>
    </div>
  )
}
