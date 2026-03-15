"use client"

import {
  Building2,
  CreditCard,
  Link2,
  List,
  User,
  Users,
} from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsDonationOptions } from "@/app/settings/settings-donation-options"
import { SettingsIntegrations } from "@/app/settings/settings-integrations"
import { SettingsOrganization } from "@/app/settings/settings-organization"
import { SettingsProfile } from "@/app/settings/settings-profile"
import { SettingsTeam } from "@/app/settings/settings-team"

export default function SettingsPage() {
  return (
    <Tabs defaultValue="profile" className="flex flex-col gap-6">
      <TabsList className="inline-flex h-9 w-full justify-start gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
        <TabsTrigger value="profile" className="gap-2 px-4">
          <User className="size-4 shrink-0" strokeWidth={1.5} />
          My Profile
        </TabsTrigger>
        <TabsTrigger value="organization" className="gap-2 px-4">
          <Building2 className="size-4 shrink-0" strokeWidth={1.5} />
          Organization
        </TabsTrigger>
        <TabsTrigger value="team" className="gap-2 px-4">
          <Users className="size-4 shrink-0" strokeWidth={1.5} />
          Team
        </TabsTrigger>
        <TabsTrigger value="integrations" className="gap-2 px-4">
          <Link2 className="size-4 shrink-0" strokeWidth={1.5} />
          Integrations
        </TabsTrigger>
        <TabsTrigger value="donation-options" className="gap-2 px-4">
          <List className="size-4 shrink-0" strokeWidth={1.5} />
          Custom Categories
        </TabsTrigger>
        <TabsTrigger value="billing" className="gap-2 px-4">
          <CreditCard className="size-4 shrink-0" strokeWidth={1.5} />
          Billing
        </TabsTrigger>
      </TabsList>
      <main className="min-w-0 flex-1">
        <TabsContent value="profile" className="mt-0">
          <SettingsProfile />
        </TabsContent>
        <TabsContent value="organization" className="mt-0">
          <SettingsOrganization />
        </TabsContent>
        <TabsContent value="team" className="mt-0">
          <SettingsTeam />
        </TabsContent>
        <TabsContent value="integrations" className="mt-0">
          <SettingsIntegrations />
        </TabsContent>
        <TabsContent value="donation-options" className="mt-0">
          <SettingsDonationOptions />
        </TabsContent>
        <TabsContent value="billing" className="mt-0">
          <div className="rounded-xl border border-dashed border-zinc-200 bg-muted/20 p-12 text-center">
            <CreditCard className="mx-auto size-12 text-muted-foreground/50" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-semibold">Billing</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your subscription and payment methods. Coming soon.
            </p>
          </div>
        </TabsContent>
      </main>
    </Tabs>
  )
}
