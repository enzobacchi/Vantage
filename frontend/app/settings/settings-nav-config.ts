import type { LucideIcon } from "lucide-react"
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

export type SettingsNavItem = {
  value: string
  label: string
  icon: LucideIcon
}

export type SettingsNavGroup = {
  label: string
  items: SettingsNavItem[]
}

export const VALID_TABS = [
  "profile",
  "organization",
  "team",
  "integrations",
  "donation-options",
  "email-templates",
  "year-end",
  "notifications",
  "audit-log",
  "billing",
] as const

export type ValidTab = (typeof VALID_TABS)[number]

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: "Account",
    items: [
      { value: "profile", label: "My Profile", icon: User },
      { value: "organization", label: "Organization", icon: Building2 },
      { value: "team", label: "Team", icon: Users },
      { value: "billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "Donor Management",
    items: [
      { value: "donation-options", label: "Donation Options", icon: List },
      { value: "integrations", label: "Integrations", icon: Link2 },
    ],
  },
  {
    label: "Communication",
    items: [
      { value: "email-templates", label: "Email Templates", icon: Mail },
      { value: "year-end", label: "Year-End Receipts", icon: FileText },
      { value: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { value: "audit-log", label: "Activity Log", icon: ClipboardList },
    ],
  },
]
