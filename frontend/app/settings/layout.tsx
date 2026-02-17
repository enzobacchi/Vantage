import { redirect } from "next/navigation"
import { getCurrentUserOrg } from "@/lib/auth"
import DashboardShell from "@/app/dashboard/dashboard-shell"
import { Separator } from "@/components/ui/separator"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userOrg = await getCurrentUserOrg()
  if (!userOrg) {
    redirect("/login?next=/settings")
  }
  return (
    <DashboardShell>
      <div className="flex flex-1 flex-col">
        <header className="px-4 lg:px-6 pt-6">
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account settings and set e-mail preferences.
          </p>
          <Separator className="mt-6" />
        </header>
        <div className="flex-1 px-4 lg:px-6 pt-8 pb-8">
          {children}
        </div>
      </div>
    </DashboardShell>
  )
}
