"use client"

import {
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Link2,
  List,
  Mail,
  User,
  Users,
} from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsAuditLog } from "@/app/settings/settings-audit-log"
import { SettingsBilling } from "@/app/settings/settings-billing"
import { SettingsDonationOptions } from "@/app/settings/settings-donation-options"
import { SettingsEmailTemplates } from "@/app/settings/settings-email-templates"
import { SettingsIntegrations } from "@/app/settings/settings-integrations"
import { SettingsNotifications } from "@/app/settings/settings-notifications"
import { SettingsOrganization } from "@/app/settings/settings-organization"
import { SettingsProfile } from "@/app/settings/settings-profile"
import { SettingsTeam } from "@/app/settings/settings-team"
import { SettingsYearEndReceipts } from "@/app/settings/settings-year-end-receipts"

export default function SettingsPage() {
  return (
    <Tabs defaultValue="profile" className="flex flex-col gap-6">
      <TabsList className="inline-flex h-9 w-full justify-start gap-0.5 rounded-lg border border-border bg-muted p-1 overflow-x-auto">
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
        <TabsTrigger value="email-templates" className="gap-2 px-4">
          <Mail className="size-4 shrink-0" strokeWidth={1.5} />
          Email Templates
        </TabsTrigger>
        <TabsTrigger value="year-end" className="gap-2 px-4">
          <FileText className="size-4 shrink-0" strokeWidth={1.5} />
          Year-End Receipts
        </TabsTrigger>
        <TabsTrigger value="notifications" className="gap-2 px-4">
          <Bell className="size-4 shrink-0" strokeWidth={1.5} />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="audit-log" className="gap-2 px-4">
          <ClipboardList className="size-4 shrink-0" strokeWidth={1.5} />
          Activity Log
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
        <TabsContent value="email-templates" className="mt-0">
          <SettingsEmailTemplates />
        </TabsContent>
        <TabsContent value="year-end" className="mt-0">
          <SettingsYearEndReceipts />
        </TabsContent>
        <TabsContent value="notifications" className="mt-0">
          <SettingsNotifications />
        </TabsContent>
        <TabsContent value="audit-log" className="mt-0">
          <SettingsAuditLog />
        </TabsContent>
        <TabsContent value="billing" className="mt-0">
          <SettingsBilling />
        </TabsContent>
      </main>
    </Tabs>
  )
}
