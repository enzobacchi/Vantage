import { redirect } from "next/navigation"
import { getCurrentUserOrg } from "@/lib/auth"

export default async function DonorsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userOrg = await getCurrentUserOrg()
  if (!userOrg) {
    redirect("/login?next=/donors")
  }
  return <>{children}</>
}
